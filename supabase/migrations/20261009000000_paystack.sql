-- ---------------------------------------------------------------------------
-- Paystack payments (Nigerian naira)
--
-- Paystack replaces Stripe card holds and RevenueCat:
--   * LushDate+ is a Paystack subscription plan, boosts are one-off charges.
--   * Show-up deposits are charged when placed and refunded in full when both
--     people check in (or the date is cancelled / expires). A no-show's
--     deposit is kept and the person who came gets the amount as credit.
-- Columns named *_cents hold the currency's minor unit (kobo for NGN).
-- Every amount comes from the server; the app never sends a price.
-- ---------------------------------------------------------------------------

alter table public.date_plans drop constraint date_plans_deposit_cents_check;
alter table public.date_plans
  add constraint date_plans_deposit_cents_check check (deposit_cents between 200000 and 2000000);

create table public.payments (
  reference text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('plus', 'boost', 'deposit')),
  plan_id uuid references public.date_plans (id) on delete set null,
  amount integer not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'refund_due', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_refund_due_idx on public.payments (created_at) where status = 'refund_due';

-- One Paystack customer (billing email) per LushDate account.
create table public.billing_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  customer_code text unique,
  subscription_code text,
  email_token text,
  updated_at timestamptz not null default now()
);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
create policy "read own payments" on public.payments
  for select to authenticated using (user_id = auth.uid());

alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;

-- Deposit limits in kobo: ₦2,000 to ₦20,000 (₦5,000 for accounts under 30 days).
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
  max_cents := case when account_age < interval '30 days' then 500000 else 2000000 end;
  if p_deposit_cents < 200000 or p_deposit_cents > max_cents then
    raise exception 'Deposits are ₦2,000 to ₦% for your account.', to_char(max_cents / 100, 'FM999,999');
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

-- A charge Paystack reports as successful (from verify or the webhook).
-- Idempotent. Returns what it did: plus | boost | deposit | duplicate |
-- unknown (not a reference we created) | refund (money to send back).
create function public.payment_succeeded(
  p_reference text,
  p_amount integer,
  p_currency text,
  p_customer_code text,
  p_plus_days integer
) returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  dep public.date_deposits;
begin
  select * into p from public.payments where reference = p_reference for update;
  if not found then
    return 'unknown';
  end if;
  if p.status not in ('pending', 'failed') then
    return 'duplicate';
  end if;

  if p_customer_code is not null then
    update public.billing_customers set customer_code = p_customer_code, updated_at = now()
    where user_id = p.user_id and customer_code is distinct from p_customer_code;
  end if;

  if p_amount <> p.amount or upper(p_currency) <> p.currency then
    update public.payments set status = 'refund_due', paid_at = now() where reference = p_reference;
    perform public.audit(p.user_id, 'paystack', 'amount_mismatch',
      jsonb_build_object('reference', p_reference, 'paid', p_amount, 'expected', p.amount, 'currency', p_currency));
    return 'refund';
  end if;

  if p.kind = 'deposit' then
    select * into dep from public.date_deposits where payment_intent = p_reference for update;
    -- Paid after the date was settled, cancelled or the attempt was replaced.
    if not found or dep.status not in ('pending', 'failed') or not exists (
      select 1 from public.date_plans where id = dep.plan_id and status in ('accepted', 'confirmed')
    ) then
      update public.payments set status = 'refund_due', paid_at = now() where reference = p_reference;
      return 'refund';
    end if;
  end if;

  update public.payments set status = 'success', paid_at = now() where reference = p_reference;
  perform public.audit(p.user_id, 'paystack', p.kind || '_paid', jsonb_build_object('reference', p_reference, 'amount', p_amount));

  if p.kind = 'plus' then
    -- One day of grace so a renewal charged on the due date never lapses.
    insert into public.entitlements (user_id, product_id, expires_at, updated_at)
    values (p.user_id, 'paystack_plus', now() + make_interval(days => p_plus_days + 1), now())
    on conflict (user_id) do update
      set product_id = excluded.product_id,
          expires_at = greatest(coalesce(public.entitlements.expires_at, now()), now()) + make_interval(days => p_plus_days),
          updated_at = now();
    return 'plus';
  elsif p.kind = 'boost' then
    perform public.grant_boost(p.user_id, p_reference, 30);
    return 'boost';
  end if;
  perform public.mark_deposit(p_reference, 'authorized');
  return 'deposit';
end $$;

-- A subscription renewal: Paystack charges the saved card itself, so the
-- reference is new to us. Matched to the account by Paystack customer.
create function public.record_renewal(
  p_customer_code text,
  p_reference text,
  p_amount integer,
  p_currency text,
  p_plus_days integer
) returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select user_id into uid from public.billing_customers where customer_code = p_customer_code;
  if uid is null then
    return 'unknown';
  end if;
  insert into public.payments (reference, user_id, kind, amount, currency)
  values (p_reference, uid, 'plus', p_amount, upper(p_currency))
  on conflict (reference) do nothing;
  return public.payment_succeeded(p_reference, p_amount, p_currency, p_customer_code, p_plus_days);
end $$;

create function public.payment_failed(p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  update public.payments set status = 'failed' where reference = p_reference and status = 'pending' returning * into p;
  if found and p.kind = 'deposit' then
    update public.date_deposits set status = 'failed' where payment_intent = p_reference and status = 'pending';
  end if;
end $$;

create function public.payment_refunded(p_reference text) returns void
language sql security definer set search_path = '' as $$
  update public.payments set status = 'refunded' where reference = p_reference and status in ('success', 'refund_due');
$$;

-- Service: a refused chargeback / dispute on a payment.
create function public.payment_disputed(p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  select * into p from public.payments where reference = p_reference;
  if found then
    perform public.apply_risk(p.user_id, 'chargeback', 40, jsonb_build_object('reference', p_reference, 'kind', p.kind));
  end if;
end $$;

revoke all on function
  public.payment_succeeded(text, integer, text, text, integer),
  public.record_renewal(text, text, integer, text, integer),
  public.payment_failed(text),
  public.payment_refunded(text),
  public.payment_disputed(text)
from public, anon, authenticated;

grant execute on function
  public.payment_succeeded(text, integer, text, text, integer),
  public.record_renewal(text, text, integer, text, integer),
  public.payment_failed(text),
  public.payment_refunded(text),
  public.payment_disputed(text)
to service_role;
