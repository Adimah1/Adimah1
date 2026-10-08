-- LushDate initial schema.
--
-- Privacy model:
--   * Raw GPS never touches the database. update_location() snaps every point to a
--     ~450 m grid before storing it, and clients can only ever see a rounded
--     distance in whole miles.
--   * Other users' profiles, locations, swipes and likes are not readable through
--     the table API at all. Clients go through the security-definer RPCs below,
--     which apply blocking, pausing, incognito and preference filters.
--   * Blocking is symmetric and removes the match (and therefore the chat).

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.gender as enum ('woman', 'man', 'nonbinary');
create type public.message_kind as enum ('text', 'snap', 'screenshot');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.verification_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  birthdate date not null,
  gender public.gender not null,
  interested_in public.gender[] not null check (cardinality(interested_in) between 1 and 3),
  bio text not null default '' check (char_length(bio) <= 500),
  looking_for text not null default 'not_sure'
    check (looking_for in ('relationship', 'casual', 'friends', 'not_sure')),
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  age_min integer not null default 18 check (age_min >= 18),
  age_max integer not null default 99 check (age_max <= 99 and age_max >= age_min),
  is_paused boolean not null default false,
  incognito boolean not null default false,
  verified boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  geo extensions.geography (Point, 4326) not null,
  updated_at timestamptz not null default now()
);
create index locations_geo_idx on public.locations using gist (geo);

create table public.swipes (
  swiper_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (swiper_id, target_id),
  check (swiper_id <> target_id)
);
create index swipes_target_liked_idx on public.swipes (target_id) where liked;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index matches_user_b_idx on public.matches (user_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text check (char_length(body) <= 2000),
  -- For snaps: storage path in the "snaps" bucket. Set to null once purged.
  media_path text,
  viewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'text' or (body is not null and char_length(btrim(body)) > 0))
);
create index messages_match_created_idx on public.messages (match_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null
    check (reason in ('fake_profile', 'harassment', 'inappropriate_content', 'underage', 'scam', 'safety_concern', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  message_id uuid references public.messages (id) on delete set null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

-- LushDate+ subscription state. Written only by the RevenueCat webhook.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  product_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Boost windows. Written only by the RevenueCat webhook.
create table public.boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index boosts_user_window_idx on public.boosts (user_id, ends_at);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  selfie_path text not null,
  status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index verification_one_pending_idx on public.verification_requests (user_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.profiles_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.birthdate > (current_date - interval '18 years')::date then
    raise exception 'LushDate is only for adults 18 and over' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(new.photos) as p(path) where p.path not like new.id::text || '/%') then
    raise exception 'photos must be stored in your own folder' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_validate
before insert or update on public.profiles
for each row execute function public.profiles_validate();

create function public.messages_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.viewed_at := null;
  if new.kind = 'snap' then
    if new.media_path is null or new.media_path not like new.match_id::text || '/%' then
      raise exception 'invalid snap path' using errcode = 'check_violation';
    end if;
    new.body := null;
    new.expires_at := now() + interval '24 hours';
  else
    new.media_path := null;
    new.expires_at := null;
  end if;
  if new.kind = 'screenshot' then
    new.body := null;
  end if;
  return new;
end $$;

create trigger messages_before_insert
before insert on public.messages
for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- Helpers (used by policies, so callable by signed-in users; they only ever
-- answer questions about the caller).
-- ---------------------------------------------------------------------------

create function public.is_match_member(p_match_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id and auth.uid() in (m.user_a, m.user_b)
  );
$$;

-- Storage helper: may the caller upload a snap at this object path?
create function public.can_upload_snap(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(object_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_match_member(folder::uuid);
end $$;

-- Storage helper: may the caller download this snap right now? Only the
-- recipient, and only for two minutes after they opened it with open_snap().
create function public.can_read_snap(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages msg
    join public.matches m on m.id = msg.match_id
    where msg.media_path = object_name
      and msg.kind = 'snap'
      and msg.sender_id <> auth.uid()
      and auth.uid() in (m.user_a, m.user_b)
      and msg.viewed_at > now() - interval '2 minutes'
  );
$$;

-- Internal helpers (security definer callers only).

create function public.has_plus(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user and e.expires_at > now()
  );
$$;

create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

create function public.years_old(p_birthdate date) returns integer
language sql stable set search_path = '' as $$
  select extract(year from age(current_date, p_birthdate))::integer;
$$;

-- ---------------------------------------------------------------------------
-- RPCs for the app
-- ---------------------------------------------------------------------------

-- Store the caller's location, snapped to a ~450 m grid, and mark them active.
create function public.update_location(lat double precision, lng double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cell constant double precision := 0.004; -- degrees of latitude, ~445 m
  snapped_lat double precision;
  lng_cell double precision;
  snapped_lng double precision;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  snapped_lat := round(lat / cell) * cell;
  lng_cell := cell / greatest(cos(radians(snapped_lat)), 0.01);
  snapped_lng := least(greatest(round(lng / lng_cell) * lng_cell, -180), 180);

  insert into public.locations (user_id, geo, updated_at)
  values (
    uid,
    extensions.st_setsrid(extensions.st_makepoint(snapped_lng, snapped_lat), 4326)::extensions.geography,
    now()
  )
  on conflict (user_id) do update set geo = excluded.geo, updated_at = excluded.updated_at;

  update public.profiles set last_active_at = now() where id = uid;
end $$;

-- The proximity feed. Free users are capped at 5 miles; LushDate+ at 100.
create function public.nearby_profiles(radius_mi integer default 5)
returns table (
  id uuid,
  display_name text,
  age integer,
  bio text,
  looking_for text,
  photos text[],
  verified boolean,
  distance_mi integer,
  active_now boolean,
  boosted boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  me public.profiles;
  my_geo extensions.geography;
  my_age integer;
  eff_mi integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into me from public.profiles p where p.id = uid;
  if not found then
    raise exception 'profile required';
  end if;
  select l.geo into my_geo from public.locations l where l.user_id = uid;
  if my_geo is null then
    return;
  end if;

  my_age := public.years_old(me.birthdate);
  eff_mi := least(
    greatest(coalesce(radius_mi, 5), 1),
    case when public.has_plus(uid) then 100 else 5 end
  );

  return query
  select
    c.id,
    c.display_name,
    c.years,
    c.bio,
    c.looking_for,
    c.photos,
    c.verified,
    greatest(1, ceil(c.meters / 1609.344))::integer,
    c.last_active_at > now() - interval '30 minutes',
    c.boosted
  from (
    select
      p.*,
      public.years_old(p.birthdate) as years,
      extensions.st_distance(l.geo, my_geo) as meters,
      exists (
        select 1 from public.boosts bo
        where bo.user_id = p.id and now() between bo.starts_at and bo.ends_at
      ) as boosted
    from public.profiles p
    join public.locations l on l.user_id = p.id
    where p.id <> uid
      and not p.is_paused
      and cardinality(p.photos) > 0
      and l.updated_at > now() - interval '7 days'
      and extensions.st_dwithin(l.geo, my_geo, eff_mi * 1609.344)
      and p.gender = any (me.interested_in)
      and me.gender = any (p.interested_in)
      and not public.is_blocked(uid, p.id)
      and not exists (
        select 1 from public.swipes s where s.swiper_id = uid and s.target_id = p.id
      )
      -- Incognito (a LushDate+ perk): only visible to people they've liked.
      and (
        not p.incognito
        or not public.has_plus(p.id)
        or exists (
          select 1 from public.swipes s2
          where s2.swiper_id = p.id and s2.target_id = uid and s2.liked
        )
      )
  ) c
  where c.years between me.age_min and me.age_max
    and my_age between c.age_min and c.age_max
  order by c.boosted desc, (c.last_active_at > now() - interval '30 minutes') desc, c.meters asc
  limit 60;
end $$;

-- A single public profile card (no birthdate, no location).
create function public.get_public_profile(target uuid)
returns table (
  id uuid,
  display_name text,
  age integer,
  gender public.gender,
  bio text,
  looking_for text,
  photos text[],
  verified boolean,
  matched boolean
)
language sql stable security definer set search_path = '' as $$
  select
    p.id,
    p.display_name,
    public.years_old(p.birthdate),
    p.gender,
    p.bio,
    p.looking_for,
    p.photos,
    p.verified,
    exists (
      select 1 from public.matches m
      where m.user_a = least(auth.uid(), p.id) and m.user_b = greatest(auth.uid(), p.id)
    )
  from public.profiles p
  where p.id = target
    and auth.uid() is not null
    and not public.is_blocked(auth.uid(), p.id);
$$;

-- Like or pass. Returns the match id when the like is mutual.
create function public.swipe(target uuid, liked boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  match_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if target = uid then
    raise exception 'cannot swipe on yourself';
  end if;
  if public.is_blocked(uid, target) then
    return null;
  end if;

  insert into public.swipes (swiper_id, target_id, liked)
  values (uid, target, liked)
  on conflict (swiper_id, target_id) do update set liked = excluded.liked, created_at = now();

  if liked and exists (
    select 1 from public.swipes s
    where s.swiper_id = target and s.target_id = uid and s.liked
  ) then
    insert into public.matches (user_a, user_b)
    values (least(uid, target), greatest(uid, target))
    on conflict (user_a, user_b) do nothing;

    select m.id into match_id from public.matches m
    where m.user_a = least(uid, target) and m.user_b = greatest(uid, target);
    return match_id;
  end if;
  return null;
end $$;

-- How many people liked you that you haven't answered yet (free).
create function public.likes_received_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.swipes s
  where s.target_id = auth.uid()
    and s.liked
    and not public.is_blocked(auth.uid(), s.swiper_id)
    and not exists (
      select 1 from public.swipes mine
      where mine.swiper_id = auth.uid() and mine.target_id = s.swiper_id
    );
$$;

-- Who liked you (LushDate+ only).
create function public.likes_received()
returns table (id uuid, display_name text, age integer, photos text[], verified boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_plus(auth.uid()) then
    raise exception 'LushDate+ required' using errcode = 'insufficient_privilege';
  end if;
  return query
  select p.id, p.display_name, public.years_old(p.birthdate), p.photos, p.verified
  from public.swipes s
  join public.profiles p on p.id = s.swiper_id
  where s.target_id = auth.uid()
    and s.liked
    and not p.is_paused
    and not public.is_blocked(auth.uid(), p.id)
    and not exists (
      select 1 from public.swipes mine
      where mine.swiper_id = auth.uid() and mine.target_id = p.id
    )
  order by s.created_at desc;
end $$;

-- The caller's matches with the other person's card and the latest message.
create function public.my_matches()
returns table (
  match_id uuid,
  other_id uuid,
  display_name text,
  photo text,
  verified boolean,
  last_kind public.message_kind,
  last_body text,
  last_sender_id uuid,
  last_at timestamptz,
  matched_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    m.id,
    o.id,
    o.display_name,
    o.photos[1],
    o.verified,
    lm.kind,
    lm.body,
    lm.sender_id,
    lm.created_at,
    m.created_at
  from public.matches m
  join public.profiles o
    on o.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select msg.kind, msg.body, msg.sender_id, msg.created_at
    from public.messages msg
    where msg.match_id = m.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b)
    and not public.is_blocked(m.user_a, m.user_b)
  order by coalesce(lm.created_at, m.created_at) desc;
$$;

-- Open a snap. Marks it viewed and returns the storage path; the recipient then
-- has two minutes to download it before storage access closes for good.
create function public.open_snap(message_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  msg public.messages;
begin
  select * into msg from public.messages m where m.id = message_id;
  if not found or not public.is_match_member(msg.match_id) then
    raise exception 'snap not found';
  end if;
  if msg.kind <> 'snap' then
    raise exception 'not a snap';
  end if;
  if msg.sender_id = uid then
    raise exception 'you cannot open your own snap';
  end if;
  if msg.viewed_at is not null or msg.media_path is null or msg.expires_at <= now() then
    raise exception 'this snap has disappeared';
  end if;
  update public.messages set viewed_at = now() where id = message_id;
  return msg.media_path;
end $$;

create function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if target = uid then
    raise exception 'cannot block yourself';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (uid, target)
  on conflict do nothing;
  delete from public.matches
  where user_a = least(uid, target) and user_b = greatest(uid, target);
end $$;

create function public.unblock_user(target uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = target;
$$;

-- People the caller has blocked, so they can be unblocked from Settings.
create function public.my_blocks()
returns table (id uuid, display_name text, photo text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.photos[1], b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Service-role-only RPCs (edge functions)
-- ---------------------------------------------------------------------------

-- Grant a boost; stacks after any boost that is still running.
create function public.grant_boost(p_user uuid, p_transaction_id text, p_minutes integer default 30)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  start_at timestamptz;
begin
  select greatest(now(), coalesce(max(b.ends_at), now())) into start_at
  from public.boosts b where b.user_id = p_user;
  insert into public.boosts (user_id, transaction_id, starts_at, ends_at)
  values (p_user, p_transaction_id, start_at, start_at + make_interval(mins => p_minutes))
  on conflict (transaction_id) do nothing;
end $$;

-- Snap media that must be deleted from storage: opened over 2 minutes ago,
-- expired unopened, or orphaned because the chat was deleted.
create function public.snaps_to_purge() returns table (object_name text)
language sql stable security definer set search_path = '' as $$
  select m.media_path
  from public.messages m
  where m.kind = 'snap'
    and m.media_path is not null
    and (m.viewed_at < now() - interval '2 minutes' or m.expires_at < now())
  union
  select o.name
  from storage.objects o
  where o.bucket_id = 'snaps'
    and o.created_at < now() - interval '1 hour'
    and not exists (
      select 1 from public.messages m
      where m.media_path = o.name and m.viewed_at is null and m.expires_at > now()
    );
$$;

create function public.mark_snaps_purged(object_names text[]) returns void
language sql security definer set search_path = '' as $$
  update public.messages set media_path = null where media_path = any (object_names);
$$;

create function public.review_verification(request_id uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  req public.verification_requests;
begin
  update public.verification_requests
  set status = case when approve then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
      reviewed_at = now()
  where id = request_id and status = 'pending'
  returning * into req;
  if not found then
    raise exception 'no pending request %', request_id;
  end if;
  if approve then
    update public.profiles set verified = true where id = req.user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- profiles: owner reads and edits their own row; everyone else uses RPCs.
-- verified/last_active_at/birthdate cannot be changed by the client.
grant select on public.profiles to authenticated;
grant insert (id, display_name, birthdate, gender, interested_in, bio, looking_for, photos, age_min, age_max)
  on public.profiles to authenticated;
grant update (display_name, gender, interested_in, bio, looking_for, photos, age_min, age_max, is_paused, incognito)
  on public.profiles to authenticated;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- No direct client access at all.
alter table public.locations enable row level security;
alter table public.swipes enable row level security;

alter table public.matches enable row level security;
grant select on public.matches to authenticated;
create policy "read own matches" on public.matches
  for select to authenticated using (auth.uid() in (user_a, user_b));

alter table public.messages enable row level security;
grant select on public.messages to authenticated;
grant insert (match_id, sender_id, kind, body, media_path) on public.messages to authenticated;
create policy "read messages in my matches" on public.messages
  for select to authenticated using (public.is_match_member(match_id));
create policy "send messages in my matches" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_match_member(match_id));

alter table public.blocks enable row level security;
grant select on public.blocks to authenticated;
create policy "read own blocks" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

alter table public.reports enable row level security;
grant select on public.reports to authenticated;
grant insert (reporter_id, reported_id, reason, details, message_id) on public.reports to authenticated;
create policy "read own reports" on public.reports
  for select to authenticated using (reporter_id = auth.uid());
create policy "file reports" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and reported_id <> auth.uid());

alter table public.entitlements enable row level security;
grant select on public.entitlements to authenticated;
create policy "read own entitlement" on public.entitlements
  for select to authenticated using (user_id = auth.uid());

alter table public.boosts enable row level security;
grant select on public.boosts to authenticated;
create policy "read own boosts" on public.boosts
  for select to authenticated using (user_id = auth.uid());

alter table public.push_tokens enable row level security;
grant select, insert, update, delete on public.push_tokens to authenticated;
create policy "manage own push tokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.verification_requests enable row level security;
grant select on public.verification_requests to authenticated;
grant insert (user_id, selfie_path) on public.verification_requests to authenticated;
create policy "read own verification" on public.verification_requests
  for select to authenticated using (user_id = auth.uid());
create policy "request verification" on public.verification_requests
  for insert to authenticated
  with check (user_id = auth.uid() and selfie_path like auth.uid()::text || '/%');

-- Functions: everything is revoked by default, then granted per audience.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_match_member(uuid),
  public.can_upload_snap(text),
  public.can_read_snap(text),
  public.update_location(double precision, double precision),
  public.nearby_profiles(integer),
  public.get_public_profile(uuid),
  public.swipe(uuid, boolean),
  public.likes_received_count(),
  public.likes_received(),
  public.my_matches(),
  public.open_snap(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.my_blocks()
to authenticated;

grant execute on function
  public.grant_boost(uuid, text, integer),
  public.snaps_to_purge(),
  public.mark_snaps_purged(text[]),
  public.review_verification(uuid, boolean)
to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages, public.matches;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('snaps', 'snaps', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('verifications', 'verifications', false, 10485760, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

-- Profile photos: public bucket, but only the owner can write to their folder.
create policy "photos: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "photos: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "photos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and split_part(name, '/', 1) = auth.uid()::text);

-- Snaps: upload into a match you belong to; only the recipient can read, once.
create policy "snaps: upload to my matches" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'snaps' and public.can_upload_snap(name));
create policy "snaps: recipient reads once" on storage.objects
  for select to authenticated
  using (bucket_id = 'snaps' and public.can_read_snap(name));

-- Verification selfies: write-only for the user; reviewed with the service role.
create policy "verifications: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verifications' and split_part(name, '/', 1) = auth.uid()::text);
