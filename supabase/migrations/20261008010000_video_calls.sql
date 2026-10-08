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
