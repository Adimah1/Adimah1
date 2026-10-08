-- LushDate database setup: all migrations in order, for pasting into the
-- Supabase SQL Editor (Run once, on an empty project).
-- Generated from supabase/migrations/*.sql — edit those, not this file.

-- ===== migrations/20261008000000_init.sql =====
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

-- ===== migrations/20261008010000_video_calls.sql =====
-- Video calls between matches. Starting a call is a LushDate+ perk; answering
-- one is free. Media goes through LiveKit; this table only tracks call state,
-- and the call-token edge function hands out room access based on it.

create type public.call_status as enum ('ringing', 'accepted', 'declined', 'missed', 'ended');

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  status public.call_status not null default 'ringing',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> callee_id)
);
-- At most one live call per match.
create unique index calls_one_live_per_match on public.calls (match_id) where status in ('ringing', 'accepted');
create index calls_callee_idx on public.calls (callee_id, created_at desc);

alter table public.calls enable row level security;
grant select on public.calls to authenticated;
create policy "read my calls" on public.calls
  for select to authenticated using (auth.uid() in (caller_id, callee_id));

alter publication supabase_realtime add table public.calls;

-- How long a call rings before it counts as missed.
create function public.ring_timeout() returns interval
language sql immutable as $$ select interval '45 seconds' $$;

-- Start a video call with a match. Requires LushDate+.
create function public.start_call(p_match_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.matches;
  other uuid;
  call_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_plus(uid) then
    raise exception 'LushDate+ required' using errcode = 'insufficient_privilege';
  end if;
  select * into m from public.matches where id = p_match_id and uid in (user_a, user_b);
  if not found then
    raise exception 'match not found';
  end if;
  other := case when m.user_a = uid then m.user_b else m.user_a end;
  if public.is_blocked(uid, other) then
    raise exception 'match not found';
  end if;

  -- Clear out a call that rang out without anyone ending it.
  update public.calls set status = 'missed', ended_at = now()
  where match_id = p_match_id and status = 'ringing' and created_at < now() - public.ring_timeout();

  if exists (select 1 from public.calls where match_id = p_match_id and status in ('ringing', 'accepted')) then
    raise exception 'a call is already in progress';
  end if;

  insert into public.calls (match_id, caller_id, callee_id)
  values (p_match_id, uid, other)
  returning id into call_id;
  return call_id;
end $$;

-- The person being called accepts or declines.
create function public.answer_call(p_call_id uuid, accept boolean) returns public.call_status
language plpgsql security definer set search_path = '' as $$
declare
  c public.calls;
begin
  select * into c from public.calls where id = p_call_id and callee_id = auth.uid() for update;
  if not found then
    raise exception 'call not found';
  end if;
  if c.status <> 'ringing' then
    return c.status;
  end if;
  if c.created_at < now() - public.ring_timeout() then
    update public.calls set status = 'missed', ended_at = now() where id = p_call_id;
    return 'missed';
  end if;
  if accept then
    update public.calls set status = 'accepted', answered_at = now() where id = p_call_id;
    return 'accepted';
  end if;
  update public.calls set status = 'declined', ended_at = now() where id = p_call_id;
  return 'declined';
end $$;

-- Either person hangs up (or the caller cancels while it's ringing).
create function public.end_call(p_call_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.calls
  set status = case when status = 'ringing' then 'missed'::public.call_status else 'ended'::public.call_status end,
      ended_at = now()
  where id = p_call_id
    and auth.uid() in (caller_id, callee_id)
    and status in ('ringing', 'accepted');
$$;

-- Blocking ends any live call between the two people (the match row and its
-- calls are deleted by block_user, which cascades).

revoke execute on function
  public.ring_timeout(),
  public.start_call(uuid),
  public.answer_call(uuid, boolean),
  public.end_call(uuid)
from public, anon, authenticated;

grant execute on function
  public.start_call(uuid),
  public.answer_call(uuid, boolean),
  public.end_call(uuid)
to authenticated;

-- ===== migrations/20261008020000_trust_safety.sql =====
-- LushDate trust & safety layer ("zero trust"): every account, message,
-- location ping and payment is checked server-side. Design notes, thresholds
-- and fallbacks are documented in docs/SECURITY.md; keep the two in sync.
--
-- Enforcement ladder (automatic, escalating only; de-escalation needs review
-- or a decayed score):
--   risk_score  0-59  active
--   risk_score 60-89  shadowbanned  (invisible to new people, never told)
--   risk_score 90+    frozen        (cannot act; sees "under review", can appeal)
--   banned            only by a human reviewer

-- ---------------------------------------------------------------------------
-- Account standing on profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column verification_tier smallint not null default 0 check (verification_tier between 0 and 2),
  add column kyc_status text not null default 'none' check (kyc_status in ('none', 'pending', 'approved', 'rejected')),
  add column risk_score integer not null default 0 check (risk_score between 0 and 100),
  add column account_status text not null default 'active'
    check (account_status in ('active', 'shadowbanned', 'frozen', 'banned')),
  add column status_reason text,
  add column emergency_contact_name text check (char_length(emergency_contact_name) <= 60),
  add column emergency_contact_phone text check (emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.profiles.verification_tier is
  '0 = phone only, 1 = selfie verified by a reviewer, 2 = government ID + liveness (KYC)';

-- Every security-relevant event, for scoring and for evidence in disputes.
create table public.risk_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  weight integer not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index risk_events_user_idx on public.risk_events (user_id, created_at desc);

-- Enforcement and money actions, kept even after the account is deleted.
create table public.security_audit (
  id bigint generated always as identity primary key,
  user_id uuid,
  actor text not null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index security_audit_user_idx on public.security_audit (user_id, created_at desc);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index appeals_one_open_idx on public.appeals (user_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Risk scoring and enforcement
-- ---------------------------------------------------------------------------

create function public.audit(p_user uuid, p_actor text, p_action text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.security_audit (user_id, actor, action, detail) values (p_user, p_actor, p_action, p_detail);
$$;

create function public.set_account_status(p_user uuid, p_status text, p_reason text, p_actor text default 'system')
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set account_status = p_status, status_reason = p_reason
  where id = p_user and account_status is distinct from p_status;
  if found then
    perform public.audit(p_user, p_actor, 'status:' || p_status, jsonb_build_object('reason', p_reason));
  end if;
end $$;

-- Record a risk signal, recompute the 30-day score and apply the ladder.
create function public.apply_risk(p_user uuid, p_kind text, p_weight integer, p_detail jsonb default '{}')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  score integer;
  current_status text;
begin
  insert into public.risk_events (user_id, kind, weight, detail) values (p_user, p_kind, p_weight, p_detail);

  select least(100, greatest(0, coalesce(sum(weight), 0)))::integer into score
  from public.risk_events
  where user_id = p_user and created_at > now() - interval '30 days';

  update public.profiles set risk_score = score where id = p_user
  returning account_status into current_status;

  if current_status in ('frozen', 'banned') then
    return score;
  elsif score >= 90 then
    perform public.set_account_status(p_user, 'frozen', 'risk_score');
  elsif score >= 60 then
    perform public.set_account_status(p_user, 'shadowbanned', 'risk_score');
  elsif current_status = 'shadowbanned' and score < 40 then
    perform public.set_account_status(p_user, 'active', 'risk_decayed');
  end if;
  return score;
end $$;

-- Raises for frozen/banned callers. Used by every action path.
create function public.assert_can_act(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_user and account_status in ('frozen', 'banned')) then
    raise exception 'Your account is under review. You can send an appeal from the app.'
      using errcode = 'insufficient_privilege', hint = 'account_frozen';
  end if;
end $$;

-- What the app may know about its own standing. A shadowban reads as active.
create function public.my_account_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', case when p.account_status = 'shadowbanned' then 'active' else p.account_status end,
    'reason', case when p.account_status in ('frozen', 'banned') then p.status_reason end,
    'verification_tier', p.verification_tier,
    'kyc_status', p.kyc_status,
    'appeal_open', exists (select 1 from public.appeals a where a.user_id = p.id and a.status = 'open')
  )
  from public.profiles p where p.id = auth.uid();
$$;

create function public.submit_appeal(p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.appeals (user_id, message) values (auth.uid(), btrim(p_message));
  perform public.audit(auth.uid(), 'user', 'appeal_submitted');
exception when unique_violation then
  raise exception 'You already have an appeal waiting for review.';
end $$;

-- Reviewer actions (service role, e.g. from an admin tool).
create function public.review_account(p_user uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'restore' then
    -- Clear the score so the ladder doesn't immediately re-apply.
    insert into public.risk_events (user_id, kind, weight, detail)
    select p_user, 'review_restore', -coalesce(sum(weight), 0), jsonb_build_object('note', p_note)
    from public.risk_events where user_id = p_user and created_at > now() - interval '30 days';
    update public.profiles set risk_score = 0 where id = p_user;
    perform public.set_account_status(p_user, 'active', 'review_restored', 'reviewer');
  elsif p_action in ('freeze', 'ban', 'shadowban') then
    perform public.set_account_status(
      p_user,
      case p_action when 'freeze' then 'frozen' when 'ban' then 'banned' else 'shadowbanned' end,
      coalesce(p_note, 'reviewer'),
      'reviewer'
    );
  else
    raise exception 'unknown action %', p_action;
  end if;
  update public.appeals
  set status = case when p_action = 'restore' then 'accepted' else 'rejected' end, resolved_at = now()
  where user_id = p_user and status = 'open';
end $$;

-- Rapid-report auto-freeze: every report adds risk; 3+ different reporters in
-- 24 hours freezes the account pending human review.
create function public.reports_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reporters integer;
begin
  perform public.apply_risk(
    new.reported_id,
    'reported',
    case when new.reason in ('scam', 'underage', 'safety_concern') then 20 else 12 end,
    jsonb_build_object('report', new.id, 'reason', new.reason)
  );
  select count(distinct reporter_id) into reporters
  from public.reports
  where reported_id = new.reported_id and created_at > now() - interval '24 hours';
  if reporters >= 3 then
    perform public.set_account_status(new.reported_id, 'frozen', 'multiple_reports');
  end if;
  return new;
end $$;

create trigger reports_after_insert
after insert on public.reports
for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------------
-- Action gates: frozen accounts can't swipe, message or call; shadowbanned
-- accounts never form new matches (silently).
-- ---------------------------------------------------------------------------

create function public.swipes_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_act(new.swiper_id);
  return new;
end $$;

create trigger swipes_gate before insert or update on public.swipes
for each row execute function public.swipes_gate();

create function public.matches_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.profiles
    where id in (new.user_a, new.user_b) and account_status <> 'active'
  ) then
    return null; -- skip the insert; swipe() then reports "no match"
  end if;
  return new;
end $$;

create trigger matches_gate before insert on public.matches
for each row execute function public.matches_gate();

create function public.calls_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_can_act(new.caller_id);
  if exists (select 1 from public.profiles where id = new.caller_id and account_status = 'shadowbanned') then
    raise exception 'Video calls aren’t available right now.';
  end if;
  return new;
end $$;

create trigger calls_gate before insert on public.calls
for each row execute function public.calls_gate();

-- ---------------------------------------------------------------------------
-- Message screening
-- ---------------------------------------------------------------------------

alter table public.messages
  add column held boolean not null default false,
  add column held_reason text check (held_reason in ('payment', 'shadow', 'velocity')),
  add column flags text[] not null default '{}';

-- Money requests and off-platform payment rails (the core of romance scams).
create function public.mentions_payment(body text) returns boolean
language sql immutable set search_path = '' as $$
  select body ~* (
    'cash ?app|(^|\s)\$[a-z][a-z0-9_]{2,}|venmo|zelle|pay ?pal|western union|moneygram|wire (me|transfer|the money)'
    || '|gift ?cards?|itunes card|steam card|google play card|apple card code|bitcoin|\mbtc\M|usdt|crypto|wallet address'
    || '|send (me )?(some )?money|lend me|loan me|bank (details|account|transfer)|routing number|\miban\M|sort code'
  );
$$;

-- Contact details that move the conversation off LushDate.
create function public.mentions_contact(body text) returns boolean
language sql immutable set search_path = '' as $$
  select body ~* (
    '\+?\d[\d\s().-]{7,}\d'
    || '|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    || '|https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|me|ly|link|xyz)\M'
    || '|whats ?app|telegram|\mkik\M|snapchat|\msnap:|instagram|\minsta\M|\mig:|signal app|wechat'
  );
$$;

-- Runs after messages_before_insert (alphabetical trigger order).
create function public.messages_screen() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sender public.profiles;
  v_body text := coalesce(new.body, '');
  low_trust boolean;
  fresh_matches integer;
  copies integer;
begin
  select * into sender from public.profiles where id = new.sender_id;
  perform public.assert_can_act(new.sender_id);

  new.held := false;
  new.held_reason := null;
  new.flags := '{}';

  -- Shadowbanned: the sender sees their message as sent; nobody else does.
  if sender.account_status = 'shadowbanned' then
    new.held := true;
    new.held_reason := 'shadow';
  end if;

  if new.kind <> 'text' then
    return new;
  end if;

  low_trust := sender.verification_tier < 2
    or sender.created_at > now() - interval '14 days'
    or sender.risk_score >= 30;

  if public.mentions_payment(v_body) then
    new.flags := new.flags || 'payment'::text;
    perform public.apply_risk(new.sender_id, 'payment_mention', case when low_trust then 15 else 5 end,
      jsonb_build_object('match', new.match_id));
    if low_trust and not new.held then
      new.held := true;
      new.held_reason := 'payment';
    end if;
  end if;

  if public.mentions_contact(v_body) then
    new.flags := new.flags || 'contact'::text;
    perform public.apply_risk(new.sender_id, 'contact_shared', 2, jsonb_build_object('match', new.match_id));
  end if;

  -- Velocity: messaging 20+ different matches within an hour.
  select count(distinct match_id) into fresh_matches
  from public.messages
  where sender_id = new.sender_id and created_at > now() - interval '1 hour';
  if fresh_matches >= 20 then
    perform public.apply_risk(new.sender_id, 'message_velocity', 15, jsonb_build_object('matches', fresh_matches));
  end if;

  -- Scripts: the same long message pasted to 4+ other matches in a day.
  if char_length(v_body) >= 20 then
    select count(distinct match_id) into copies
    from public.messages
    where sender_id = new.sender_id and messages.body = new.body and match_id <> new.match_id
      and created_at > now() - interval '24 hours';
    if copies >= 4 then
      perform public.apply_risk(new.sender_id, 'copy_paste', 15, jsonb_build_object('copies', copies));
    end if;
  end if;

  return new;
end $$;

create trigger messages_screen before insert on public.messages
for each row execute function public.messages_screen();

-- Recipients never see held messages; senders still see their own.
drop policy "read messages in my matches" on public.messages;
create policy "read messages in my matches" on public.messages
  for select to authenticated
  using (public.is_match_member(match_id) and (not held or sender_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Feed, likes, profiles and chat list respect account standing and held messages
-- ---------------------------------------------------------------------------

create or replace function public.nearby_profiles(radius_mi integer default 5)
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
      and p.account_status = 'active'
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


create or replace function public.get_public_profile(target uuid)
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
    and (
      p.id = auth.uid()
      or p.account_status = 'active'
      -- Shadowbanned people stay visible only to existing matches, so they can't tell.
      or (
        p.account_status = 'shadowbanned'
        and exists (
          select 1 from public.matches m
          where m.user_a = least(auth.uid(), p.id) and m.user_b = greatest(auth.uid(), p.id)
        )
      )
    )
    and auth.uid() is not null
    and not public.is_blocked(auth.uid(), p.id);
$$;


create or replace function public.likes_received_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.swipes s
  where s.target_id = auth.uid()
    and s.liked
    and exists (select 1 from public.profiles lp where lp.id = s.swiper_id and lp.account_status = 'active')
    and not public.is_blocked(auth.uid(), s.swiper_id)
    and not exists (
      select 1 from public.swipes mine
      where mine.swiper_id = auth.uid() and mine.target_id = s.swiper_id
    );
$$;


create or replace function public.likes_received()
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
    and p.account_status = 'active'
    and not public.is_blocked(auth.uid(), p.id)
    and not exists (
      select 1 from public.swipes mine
      where mine.swiper_id = auth.uid() and mine.target_id = p.id
    )
  order by s.created_at desc;
end $$;


create or replace function public.my_matches()
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
      and (not msg.held or msg.sender_id = auth.uid())
    order by msg.created_at desc
    limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b)
    and not public.is_blocked(m.user_a, m.user_b)
  order by coalesce(lm.created_at, m.created_at) desc;
$$;


create or replace function public.review_verification(request_id uuid, approve boolean) returns void
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
    update public.profiles
    set verified = true, verification_tier = greatest(verification_tier, 1)
    where id = req.user_id;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Location integrity
-- ---------------------------------------------------------------------------

create table public.location_pings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  geo extensions.geography (Point, 4326) not null, -- snapped, never raw
  accuracy_m real,
  mocked boolean,
  attestation text check (attestation in ('passed', 'failed', 'unavailable')),
  vpn boolean,
  ip_distance_km real,
  speed_kmh real,
  verdict text not null check (verdict in ('ok', 'suspect', 'rejected')),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index location_pings_user_idx on public.location_pings (user_id, created_at desc);

alter table public.locations add column verified boolean not null default false;

create function public.snap_point(lat double precision, lng double precision)
returns extensions.geography language plpgsql immutable set search_path = '' as $$
declare
  cell constant double precision := 0.004; -- ~445 m of latitude
  snapped_lat double precision := round(lat / cell) * cell;
  lng_cell double precision := cell / greatest(cos(radians(round(lat / cell) * cell)), 0.01);
begin
  return extensions.st_setsrid(
    extensions.st_makepoint(least(greatest(round(lng / lng_cell) * lng_cell, -180), 180), snapped_lat),
    4326
  )::extensions.geography;
end $$;

-- Called by the report-location edge function with server-side signals:
--   signals = { accuracy_m, mocked, attestation, vpn, ip_lat, ip_lng }
-- Returns { verdict, reasons }. Raw coordinates are only used in memory.
create function public.record_location(p_user uuid, lat double precision, lng double precision, signals jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  point extensions.geography;
  last record;
  v_reasons text[] := '{}';
  v_verdict text := 'ok';
  speed real;
  ip_km real;
  strikes integer;
  status text;
begin
  select account_status into status from public.profiles where id = p_user;
  if status is null then
    return jsonb_build_object('verdict', 'rejected', 'reasons', array['no_profile']);
  end if;
  if status in ('frozen', 'banned') then
    return jsonb_build_object('verdict', 'rejected', 'reasons', array['account_frozen']);
  end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    return jsonb_build_object('verdict', 'rejected', 'reasons', array['invalid']);
  end if;

  point := public.snap_point(lat, lng);

  -- Hard failures: a faked location is never stored.
  if coalesce((signals ->> 'mocked')::boolean, false) then
    v_reasons := v_reasons || 'mock_location'::text;
    perform public.apply_risk(p_user, 'mock_location', 30);
  end if;
  if signals ->> 'attestation' = 'failed' then
    v_reasons := v_reasons || 'device_integrity'::text;
    perform public.apply_risk(p_user, 'device_integrity', 25);
  end if;

  select geo, created_at into last
  from public.location_pings
  where user_id = p_user and location_pings.verdict <> 'rejected'
  order by created_at desc limit 1;
  if found then
    speed := (extensions.st_distance(last.geo, point) / 1000.0)
      / greatest(extract(epoch from now() - last.created_at) / 3600.0, 1.0 / 60);
    if speed > 900 and extensions.st_distance(last.geo, point) > 50000 then
      v_reasons := v_reasons || 'impossible_travel'::text;
      perform public.apply_risk(p_user, 'impossible_travel', 25, jsonb_build_object('kmh', round(speed)));
    end if;
  end if;

  if array_length(v_reasons, 1) > 0 then
    v_verdict := 'rejected';
  else
    -- Soft signals: allowed, but the location isn't marked verified.
    if coalesce((signals ->> 'vpn')::boolean, false) then
      v_reasons := v_reasons || 'vpn'::text;
      perform public.apply_risk(p_user, 'vpn', 3);
    end if;
    if signals ? 'ip_lat' and signals ? 'ip_lng' then
      ip_km := extensions.st_distance(
        point,
        extensions.st_setsrid(extensions.st_makepoint((signals ->> 'ip_lng')::float8, (signals ->> 'ip_lat')::float8), 4326)::extensions.geography
      ) / 1000.0;
      -- IP geolocation is coarse (mobile carriers can be hundreds of km off),
      -- so only a large mismatch counts, and only as a soft signal.
      if ip_km > 300 then
        v_reasons := v_reasons || 'ip_mismatch'::text;
        perform public.apply_risk(p_user, 'ip_mismatch', 3, jsonb_build_object('km', round(ip_km)));
      end if;
    end if;
    if coalesce((signals ->> 'accuracy_m')::real, 0) > 3000 then
      v_reasons := v_reasons || 'low_accuracy'::text;
    end if;
    if array_length(v_reasons, 1) > 0 then
      v_verdict := 'suspect';
    end if;
  end if;

  insert into public.location_pings (user_id, geo, accuracy_m, mocked, attestation, vpn, ip_distance_km, speed_kmh, verdict, reasons)
  values (
    p_user, point, (signals ->> 'accuracy_m')::real, (signals ->> 'mocked')::boolean, signals ->> 'attestation',
    (signals ->> 'vpn')::boolean, ip_km, speed, v_verdict, v_reasons
  );

  if v_verdict = 'rejected' then
    -- Repeated spoofing freezes the account until the person re-verifies.
    select count(*) into strikes from public.location_pings
    where user_id = p_user and location_pings.verdict = 'rejected' and created_at > now() - interval '7 days';
    if strikes >= 3 then
      perform public.set_account_status(p_user, 'frozen', 'location_spoofing');
    end if;
    return jsonb_build_object('verdict', v_verdict, 'reasons', v_reasons);
  end if;

  insert into public.locations (user_id, geo, updated_at, verified)
  values (p_user, point, now(), v_verdict = 'ok')
  on conflict (user_id) do update set geo = excluded.geo, updated_at = excluded.updated_at, verified = excluded.verified;
  update public.profiles set last_active_at = now() where id = p_user;

  return jsonb_build_object('verdict', v_verdict, 'reasons', v_reasons);
end $$;

-- ---------------------------------------------------------------------------
-- Identity: KYC results and one account per person / device
-- ---------------------------------------------------------------------------

create table public.identity_records (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Salted hash of document number + date of birth from the KYC provider.
  identity_hash text not null unique,
  provider text not null,
  reference text not null,
  verified_at timestamptz not null default now()
);

create table public.devices (
  device_hash text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (device_hash, user_id)
);

-- KYC provider webhook result (service role).
create function public.set_kyc_result(p_user uuid, p_status text, p_reference text, p_identity_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  other uuid;
begin
  if p_status = 'approved' then
    select user_id into other from public.identity_records where identity_hash = p_identity_hash and user_id <> p_user;
    if found then
      -- Same person, second account: refuse and flag both.
      update public.profiles set kyc_status = 'rejected' where id = p_user;
      perform public.apply_risk(p_user, 'duplicate_identity', 60, jsonb_build_object('other', other));
      perform public.apply_risk(other, 'duplicate_identity_other', 20, jsonb_build_object('other', p_user));
      perform public.audit(p_user, 'kyc', 'duplicate_identity', jsonb_build_object('reference', p_reference));
      return 'duplicate';
    end if;
    insert into public.identity_records (user_id, identity_hash, provider, reference)
    values (p_user, p_identity_hash, 'kyc', p_reference)
    on conflict (user_id) do update set identity_hash = excluded.identity_hash, reference = excluded.reference, verified_at = now();
    update public.profiles set kyc_status = 'approved', verification_tier = 2, verified = true where id = p_user;
    perform public.audit(p_user, 'kyc', 'approved', jsonb_build_object('reference', p_reference));
    return 'approved';
  end if;
  update public.profiles set kyc_status = p_status where id = p_user;
  perform public.audit(p_user, 'kyc', p_status, jsonb_build_object('reference', p_reference));
  return p_status;
end $$;

create function public.mark_kyc_pending() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set kyc_status = 'pending' where id = auth.uid() and kyc_status in ('none', 'rejected');
$$;

-- The app reports a per-install device identifier hash at sign-in.
-- A device previously used by a banned account freezes the new one.
create function public.register_device(p_device_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  accounts integer;
begin
  if uid is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  insert into public.devices (device_hash, user_id) values (p_device_hash, uid)
  on conflict (device_hash, user_id) do update set last_seen = now();

  if exists (
    select 1 from public.devices d join public.profiles p on p.id = d.user_id
    where d.device_hash = p_device_hash and d.user_id <> uid and p.account_status = 'banned'
  ) then
    perform public.set_account_status(uid, 'frozen', 'ban_evasion');
    return;
  end if;

  select count(distinct user_id) into accounts from public.devices where device_hash = p_device_hash;
  if accounts > 3 then
    perform public.apply_risk(uid, 'shared_device', 20, jsonb_build_object('accounts', accounts));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Payments: show-up deposits (symmetric, platform-held, never paid out)
--
-- Both people place the same refundable hold (a Stripe authorization, not a
-- charge). Both check in at the venue -> both holds are released. One
-- no-shows -> their hold is captured and the person who came gets the same
-- amount as LushDate credit toward their next deposit. Money never moves
-- from one user to another, so there are no payouts to launder or scam.
-- ---------------------------------------------------------------------------

create table public.date_plans (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  place_name text not null check (char_length(place_name) between 2 and 120),
  place extensions.geography (Point, 4326) not null,
  starts_at timestamptz not null,
  deposit_cents integer not null check (deposit_cents between 500 and 10000),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'confirmed', 'completed', 'no_show', 'expired', 'declined', 'cancelled', 'disputed')),
  outcome_detail text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create unique index date_plans_one_open_per_match on public.date_plans (match_id)
  where status in ('proposed', 'accepted', 'confirmed');
create index date_plans_due_idx on public.date_plans (starts_at) where status in ('proposed', 'accepted', 'confirmed');

create table public.date_deposits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.date_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null,
  payment_intent text unique, -- null when fully covered by credit
  status text not null default 'pending' check (status in ('pending', 'authorized', 'released', 'captured', 'failed')),
  checked_in_at timestamptz,
  check_in_distance_m real,
  created_at timestamptz not null default now(),
  unique (plan_id, user_id)
);

create table public.credits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cents integer not null,
  reason text not null,
  plan_id uuid references public.date_plans (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.credit_balance(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cents), 0)::integer from public.credits where user_id = p_user;
$$;

-- Who may use money features at all.
create function public.assert_payments_allowed(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  perform public.assert_can_act(p_user);
  if p.verification_tier < 2 then
    raise exception 'Verify your ID to use date deposits.' using errcode = 'insufficient_privilege', hint = 'kyc_required';
  end if;
  if p.account_status <> 'active' or p.risk_score >= 40 then
    raise exception 'Date deposits aren’t available on your account right now.' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public.propose_date(
  p_match_id uuid,
  p_place_name text,
  p_lat double precision,
  p_lng double precision,
  p_starts_at timestamptz,
  p_deposit_cents integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.matches;
  other uuid;
  account_age interval;
  max_cents integer;
  plan_id uuid;
begin
  perform public.assert_payments_allowed(uid);
  select * into m from public.matches where id = p_match_id and uid in (user_a, user_b);
  if not found then
    raise exception 'match not found';
  end if;
  other := case when m.user_a = uid then m.user_b else m.user_a end;
  if public.is_blocked(uid, other) then
    raise exception 'match not found';
  end if;

  -- Holds must settle inside Stripe's 7-day authorization window.
  if p_starts_at < now() + interval '1 hour' or p_starts_at > now() + interval '6 days' then
    raise exception 'Pick a time between 1 hour and 6 days from now.';
  end if;

  -- New accounts get lower limits until they've built some history.
  select now() - created_at into account_age from public.profiles where id = uid;
  max_cents := case when account_age < interval '30 days' then 2500 else 10000 end;
  if p_deposit_cents < 500 or p_deposit_cents > max_cents then
    raise exception 'Deposits are $5 to $% for your account.', max_cents / 100;
  end if;

  if (select count(*) from public.date_plans
      where uid in (proposer_id, invitee_id) and status in ('proposed', 'accepted', 'confirmed')) >= 3 then
    raise exception 'You already have 3 dates planned.';
  end if;
  if (select count(*) from public.date_plans
      where proposer_id = uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You’ve proposed a lot of dates today. Try again tomorrow.';
  end if;

  insert into public.date_plans (match_id, proposer_id, invitee_id, place_name, place, starts_at, deposit_cents)
  values (
    p_match_id, uid, other, btrim(p_place_name),
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_starts_at, p_deposit_cents
  )
  returning id into plan_id;
  perform public.audit(uid, 'user', 'date_proposed', jsonb_build_object('plan', plan_id, 'cents', p_deposit_cents));
  return plan_id;
exception when unique_violation then
  raise exception 'There’s already a date planned in this chat.';
end $$;

create function public.respond_date(p_plan_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  plan public.date_plans;
begin
  select * into plan from public.date_plans where id = p_plan_id and invitee_id = auth.uid() for update;
  if not found or plan.status <> 'proposed' then
    raise exception 'This date can’t be answered any more.';
  end if;
  if p_accept then
    perform public.assert_payments_allowed(auth.uid());
    update public.date_plans set status = 'accepted' where id = p_plan_id;
    return 'accepted';
  end if;
  update public.date_plans set status = 'declined' where id = p_plan_id;
  return 'declined';
end $$;

-- Either person can cancel until 12 hours before; holds are then released.
create function public.cancel_date(p_plan_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  plan public.date_plans;
begin
  select * into plan from public.date_plans
  where id = p_plan_id and auth.uid() in (proposer_id, invitee_id) for update;
  if not found or plan.status not in ('proposed', 'accepted', 'confirmed') then
    raise exception 'This date can’t be cancelled.';
  end if;
  if plan.status = 'confirmed' and plan.starts_at < now() + interval '12 hours' then
    raise exception 'It’s too late to cancel without losing your deposit. Message your date instead.';
  end if;
  update public.date_plans set status = 'cancelled', outcome_detail = 'cancelled_by:' || auth.uid() where id = p_plan_id;
  return 'cancelled';
end $$;

create function public.dispute_date(p_plan_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.date_plans
  set status = 'disputed', outcome_detail = left(coalesce(p_reason, ''), 500)
  where id = p_plan_id
    and auth.uid() in (proposer_id, invitee_id)
    and status in ('confirmed', 'completed', 'no_show')
    and now() < starts_at + interval '48 hours';
  if not found then
    raise exception 'This date can’t be disputed.';
  end if;
  perform public.audit(auth.uid(), 'user', 'date_disputed', jsonb_build_object('plan', p_plan_id));
end $$;

-- Service: may this person place their deposit now? Returns the card amount
-- still due after applying their credit (0 = fully covered by credit).
create function public.deposit_due(p_user uuid, p_plan_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  plan public.date_plans;
  existing public.date_deposits;
begin
  perform public.assert_payments_allowed(p_user);
  select * into plan from public.date_plans where id = p_plan_id and p_user in (proposer_id, invitee_id);
  if not found or plan.status not in ('accepted', 'confirmed') then
    raise exception 'This date isn’t ready for deposits.';
  end if;
  select * into existing from public.date_deposits where plan_id = p_plan_id and user_id = p_user;
  if found and existing.status = 'authorized' then
    raise exception 'Your deposit is already in place.';
  end if;
  return greatest(0, plan.deposit_cents - greatest(0, public.credit_balance(p_user)));
end $$;

create function public.record_deposit_intent(p_plan_id uuid, p_user uuid, p_payment_intent text, p_amount integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.date_deposits (plan_id, user_id, amount_cents, payment_intent, status)
  values (p_plan_id, p_user, p_amount, p_payment_intent, 'pending')
  on conflict (plan_id, user_id) do update
    set payment_intent = excluded.payment_intent, amount_cents = excluded.amount_cents, status = 'pending';
$$;

create function public.confirm_if_ready(p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.date_deposits where plan_id = p_plan_id and status = 'authorized') = 2 then
    update public.date_plans set status = 'confirmed' where id = p_plan_id and status = 'accepted';
  end if;
end $$;

-- Deposit fully covered by credit: spend the credit, no card involved.
create function public.deposit_with_credit(p_plan_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cents integer;
begin
  select deposit_cents into cents from public.date_plans where id = p_plan_id;
  insert into public.credits (user_id, cents, reason, plan_id) values (p_user, -cents, 'deposit', p_plan_id);
  insert into public.date_deposits (plan_id, user_id, amount_cents, status)
  values (p_plan_id, p_user, cents, 'authorized')
  on conflict (plan_id, user_id) do update set status = 'authorized', payment_intent = null, amount_cents = excluded.amount_cents;
  perform public.confirm_if_ready(p_plan_id);
end $$;

-- Stripe webhook outcomes for a payment intent.
create function public.mark_deposit(p_payment_intent text, p_status text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  dep public.date_deposits;
begin
  update public.date_deposits set status = p_status where payment_intent = p_payment_intent returning * into dep;
  if not found then
    return null;
  end if;
  perform public.audit(dep.user_id, 'stripe', 'deposit_' || p_status, jsonb_build_object('plan', dep.plan_id, 'intent', p_payment_intent));
  if p_status = 'authorized' then
    perform public.confirm_if_ready(dep.plan_id);
  end if;
  return dep.plan_id;
end $$;

-- Check-in at the venue (via the date-check-in edge function, which adds
-- device/IP signals). Only the distance is stored, never the coordinates.
create function public.record_check_in(p_user uuid, p_plan_id uuid, lat double precision, lng double precision, signals jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  plan public.date_plans;
  meters real;
begin
  perform public.assert_can_act(p_user);
  select * into plan from public.date_plans where id = p_plan_id and p_user in (proposer_id, invitee_id);
  if not found or plan.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;
  if now() < plan.starts_at - interval '30 minutes' or now() > plan.starts_at + interval '90 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'outside_window');
  end if;
  if coalesce((signals ->> 'mocked')::boolean, false) or signals ->> 'attestation' = 'failed' then
    perform public.apply_risk(p_user, 'check_in_spoof', 30, jsonb_build_object('plan', p_plan_id));
    return jsonb_build_object('ok', false, 'reason', 'location_untrusted');
  end if;
  meters := extensions.st_distance(
    plan.place,
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  );
  if meters > 250 then
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'distance_m', round(meters));
  end if;
  update public.date_deposits set checked_in_at = now(), check_in_distance_m = meters
  where plan_id = p_plan_id and user_id = p_user and checked_in_at is null;
  return jsonb_build_object('ok', true, 'distance_m', round(meters));
end $$;

-- Plans that need money actions now (for the settle-dates job).
create function public.plans_to_settle() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.date_plans
  where (status = 'confirmed' and (
          starts_at + interval '2 hours' < now()
          or (select count(*) from public.date_deposits d where d.plan_id = date_plans.id and d.checked_in_at is not null) = 2
        ))
     or (status in ('proposed', 'accepted') and starts_at < now())
     or (status in ('cancelled', 'declined', 'expired')
         and exists (select 1 from public.date_deposits d where d.plan_id = date_plans.id and d.status in ('authorized', 'pending')));
$$;

-- The money actions a plan needs: { outcome, release: [intent], capture: [intent] }.
-- Credit-covered deposits have no intent and are handled in finish_settlement.
create function public.settlement_for(p_plan_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  plan public.date_plans;
  present integer;
  outcome text;
begin
  select * into plan from public.date_plans where id = p_plan_id;
  if plan.status = 'confirmed' then
    select count(*) into present from public.date_deposits where plan_id = p_plan_id and checked_in_at is not null;
    outcome := case present when 2 then 'completed' when 1 then 'no_show' else 'expired' end;
  elsif plan.status in ('proposed', 'accepted') then
    outcome := 'expired';
  else
    outcome := plan.status; -- cancelled/declined/expired: just release
  end if;

  return jsonb_build_object(
    'outcome', outcome,
    'release', coalesce((
      select jsonb_agg(d.payment_intent) from public.date_deposits d
      where d.plan_id = p_plan_id and d.status in ('authorized', 'pending') and d.payment_intent is not null
        and not (outcome = 'no_show' and d.checked_in_at is null)
    ), '[]'::jsonb),
    'capture', coalesce((
      select jsonb_agg(d.payment_intent) from public.date_deposits d
      where d.plan_id = p_plan_id and d.status = 'authorized' and d.payment_intent is not null
        and outcome = 'no_show' and d.checked_in_at is null
    ), '[]'::jsonb)
  );
end $$;

-- Apply a settlement after the Stripe calls succeeded.
create function public.finish_settlement(p_plan_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb := public.settlement_for(p_plan_id);
  outcome text := s ->> 'outcome';
  absent public.date_deposits;
  present public.date_deposits;
begin
  if outcome = 'no_show' then
    select * into absent from public.date_deposits where plan_id = p_plan_id and checked_in_at is null and status = 'authorized';
    select * into present from public.date_deposits where plan_id = p_plan_id and checked_in_at is not null;
    update public.date_deposits set status = 'captured' where id = absent.id;
    update public.date_deposits set status = 'released' where id = present.id;
    if present.payment_intent is null and present.status = 'authorized' then
      insert into public.credits (user_id, cents, reason, plan_id)
      values (present.user_id, present.amount_cents, 'deposit_returned', p_plan_id);
    end if;
    if absent.id is not null then
      -- Credit-covered holds were already spent; card holds are captured.
      insert into public.credits (user_id, cents, reason, plan_id)
      values (present.user_id, absent.amount_cents, 'no_show_compensation', p_plan_id);
      perform public.apply_risk(absent.user_id, 'no_show', 10, jsonb_build_object('plan', p_plan_id));
    end if;
  else
    -- Release everything; give back credit that covered a deposit.
    insert into public.credits (user_id, cents, reason, plan_id)
    select user_id, amount_cents, 'deposit_returned', p_plan_id
    from public.date_deposits
    where plan_id = p_plan_id and status = 'authorized' and payment_intent is null;
    update public.date_deposits set status = 'released'
    where plan_id = p_plan_id and status in ('authorized', 'pending');
  end if;

  update public.date_plans
  set status = case when outcome in ('completed', 'no_show', 'expired') then outcome else status end,
      settled_at = now()
  where id = p_plan_id;
  perform public.audit(null, 'system', 'date_settled', jsonb_build_object('plan', p_plan_id, 'outcome', outcome));
  return outcome;
end $$;

create function public.my_credit_balance() returns integer
language sql stable security definer set search_path = '' as $$
  select public.credit_balance(auth.uid());
$$;

-- Data retention for security telemetry.
create function public.purge_security_data() returns void
language sql security definer set search_path = '' as $$
  delete from public.location_pings where created_at < now() - interval '30 days';
  delete from public.risk_events where created_at < now() - interval '180 days';
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Clients can no longer see their own risk score or a shadowban.
revoke select on public.profiles from authenticated;
grant select (
  id, display_name, birthdate, gender, interested_in, bio, looking_for, photos, age_min, age_max,
  is_paused, incognito, verified, last_active_at, created_at, verification_tier, kyc_status,
  emergency_contact_name, emergency_contact_phone
) on public.profiles to authenticated;
grant update (emergency_contact_name, emergency_contact_phone) on public.profiles to authenticated;

alter table public.risk_events enable row level security;
alter table public.security_audit enable row level security;
alter table public.identity_records enable row level security;
alter table public.devices enable row level security;
alter table public.location_pings enable row level security;
revoke all on public.risk_events, public.security_audit, public.identity_records, public.devices, public.location_pings
  from anon, authenticated;

alter table public.appeals enable row level security;
revoke all on public.appeals from anon, authenticated;
grant select on public.appeals to authenticated;
create policy "read own appeals" on public.appeals for select to authenticated using (user_id = auth.uid());

alter table public.date_plans enable row level security;
revoke all on public.date_plans from anon, authenticated;
grant select on public.date_plans to authenticated;
create policy "read my date plans" on public.date_plans
  for select to authenticated using (auth.uid() in (proposer_id, invitee_id));

alter table public.date_deposits enable row level security;
revoke all on public.date_deposits from anon, authenticated;
grant select on public.date_deposits to authenticated;
create policy "read deposits on my dates" on public.date_deposits
  for select to authenticated using (
    exists (select 1 from public.date_plans p where p.id = plan_id and auth.uid() in (p.proposer_id, p.invitee_id))
  );

alter table public.credits enable row level security;
revoke all on public.credits from anon, authenticated;
grant select on public.credits to authenticated;
create policy "read own credits" on public.credits for select to authenticated using (user_id = auth.uid());

alter publication supabase_realtime add table public.date_plans, public.date_deposits;

-- Locations now only arrive through report-location (server-side signals).
revoke execute on function public.update_location(double precision, double precision) from authenticated;

revoke execute on function
  public.audit(uuid, text, text, jsonb),
  public.set_account_status(uuid, text, text, text),
  public.apply_risk(uuid, text, integer, jsonb),
  public.assert_can_act(uuid),
  public.my_account_state(),
  public.submit_appeal(text),
  public.review_account(uuid, text, text),
  public.reports_after_insert(),
  public.swipes_gate(),
  public.matches_gate(),
  public.calls_gate(),
  public.mentions_payment(text),
  public.mentions_contact(text),
  public.messages_screen(),
  public.snap_point(double precision, double precision),
  public.record_location(uuid, double precision, double precision, jsonb),
  public.set_kyc_result(uuid, text, text, text),
  public.mark_kyc_pending(),
  public.register_device(text),
  public.credit_balance(uuid),
  public.assert_payments_allowed(uuid),
  public.propose_date(uuid, text, double precision, double precision, timestamptz, integer),
  public.respond_date(uuid, boolean),
  public.cancel_date(uuid),
  public.dispute_date(uuid, text),
  public.deposit_due(uuid, uuid),
  public.record_deposit_intent(uuid, uuid, text, integer),
  public.confirm_if_ready(uuid),
  public.deposit_with_credit(uuid, uuid),
  public.mark_deposit(text, text),
  public.record_check_in(uuid, uuid, double precision, double precision, jsonb),
  public.plans_to_settle(),
  public.settlement_for(uuid),
  public.finish_settlement(uuid),
  public.my_credit_balance(),
  public.purge_security_data()
from public, anon, authenticated;

grant execute on function
  public.my_account_state(),
  public.submit_appeal(text),
  public.mark_kyc_pending(),
  public.register_device(text),
  public.propose_date(uuid, text, double precision, double precision, timestamptz, integer),
  public.respond_date(uuid, boolean),
  public.cancel_date(uuid),
  public.dispute_date(uuid, text),
  public.my_credit_balance()
to authenticated;

grant execute on function
  public.apply_risk(uuid, text, integer, jsonb),
  public.set_account_status(uuid, text, text, text),
  public.review_account(uuid, text, text),
  public.record_location(uuid, double precision, double precision, jsonb),
  public.set_kyc_result(uuid, text, text, text),
  public.credit_balance(uuid),
  public.deposit_due(uuid, uuid),
  public.record_deposit_intent(uuid, uuid, text, integer),
  public.deposit_with_credit(uuid, uuid),
  public.mark_deposit(text, text),
  public.record_check_in(uuid, uuid, double precision, double precision, jsonb),
  public.plans_to_settle(),
  public.settlement_for(uuid),
  public.finish_settlement(uuid),
  public.purge_security_data()
to service_role;

