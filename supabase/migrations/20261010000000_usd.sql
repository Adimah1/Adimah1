-- ---------------------------------------------------------------------------
-- Prices in US dollars (cents) instead of naira.
--   LushDate+: set by the Paystack plan (e.g. $4.99/month)
--   Boost:     $0.99 (PAYSTACK_BOOST_PRICE)
--   Deposits:  $2 to $10 each ($5 for accounts under 30 days)
-- The Paystack account must have USD payments enabled.
-- ---------------------------------------------------------------------------

alter table public.payments alter column currency set default 'USD';

-- Earlier naira-sized plans keep their amounts; new plans use dollar limits.
alter table public.date_plans drop constraint date_plans_deposit_cents_check;
alter table public.date_plans
  add constraint date_plans_deposit_cents_check check (deposit_cents between 200 and 1000) not valid;

create or replace function public.propose_date(
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

  if p_starts_at < now() + interval '1 hour' or p_starts_at > now() + interval '6 days' then
    raise exception 'Pick a time between 1 hour and 6 days from now.';
  end if;

  -- New accounts get lower limits until they've built some history.
  select now() - created_at into account_age from public.profiles where id = uid;
  max_cents := case when account_age < interval '30 days' then 500 else 1000 end;
  if p_deposit_cents < 200 or p_deposit_cents > max_cents then
    raise exception 'Deposits are $2 to $% for your account.', max_cents / 100;
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
