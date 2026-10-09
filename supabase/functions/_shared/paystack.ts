// Paystack REST client and the payment logic shared by the checkout,
// verify and webhook functions. Secrets: PAYSTACK_SECRET_KEY,
// PAYSTACK_PLUS_PLAN (plan code, e.g. PLN_xxx), optional PAYSTACK_BOOST_PRICE
// (kobo, default ₦1,000).

import { admin } from './admin.ts';
export { verifyPaystackSignature } from './crypto.ts';

export const CURRENCY = 'NGN';
export const BOOST_PRICE = Number(Deno.env.get('PAYSTACK_BOOST_PRICE') ?? 100000);
const PLUS_PLAN = Deno.env.get('PAYSTACK_PLUS_PLAN') ?? '';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const PLAN_DAYS: Record<string, number> = {
  hourly: 1,
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  biannually: 182,
  annually: 365,
};

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const paystackConfigured = () => !!Deno.env.get('PAYSTACK_SECRET_KEY');

export async function paystack<T = Record<string, unknown>>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`https://api.paystack.co/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.status === false) {
    throw new Error(`Paystack ${path}: ${data?.message ?? res.status}`);
  }
  return data.data as T;
}

export interface Plan {
  plan_code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
}

let plusPlan: Plan | null = null;

/** The LushDate+ plan as configured in the Paystack dashboard, or null. */
export async function getPlusPlan(): Promise<Plan | null> {
  if (!PLUS_PLAN) return null;
  plusPlan ??= await paystack<Plan>(`plan/${encodeURIComponent(PLUS_PLAN)}`);
  return plusPlan;
}

const planDays = (plan: Plan | null) => PLAN_DAYS[plan?.interval ?? ''] ?? 30;

/** The account's billing email: the one on file, or a new one from the app. */
async function billingEmail(userId: string, provided?: string): Promise<string> {
  const { data } = await admin.from('billing_customers').select('email').eq('user_id', userId).maybeSingle();
  const email = provided?.trim().toLowerCase();
  if (email) {
    if (!EMAIL.test(email)) throw new PaymentError('That email address doesn’t look right.', 'email_invalid');
    if (email !== data?.email) {
      const { error } = await admin
        .from('billing_customers')
        .upsert({ user_id: userId, email, customer_code: null, updated_at: new Date().toISOString() });
      if (error?.code === '23505') {
        throw new PaymentError('That email is already used by another LushDate account.', 'email_taken');
      }
      if (error) throw error;
    }
    return email;
  }
  if (data?.email) return data.email;
  throw new PaymentError('Add an email for your Paystack receipts.', 'email_required');
}

export interface Checkout {
  authorizationUrl: string;
  reference: string;
}

/** Records a pending payment and opens a Paystack checkout for it. */
export async function startCheckout(opts: {
  userId: string;
  kind: 'plus' | 'boost' | 'deposit';
  amount?: number;
  planId?: string;
  email?: string;
}): Promise<Checkout> {
  if (!paystackConfigured()) throw new PaymentError('Payments aren’t set up yet.', 'not_configured', 503);
  const email = await billingEmail(opts.userId, opts.email);

  let amount = opts.amount ?? 0;
  let plan: Plan | null = null;
  if (opts.kind === 'plus') {
    plan = await getPlusPlan();
    if (!plan) throw new PaymentError('LushDate+ isn’t on sale yet.', 'not_configured', 503);
    amount = plan.amount; // Paystack charges the plan's own price.
  }
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`invalid amount ${amount}`);

  const reference = `ld_${opts.kind}_${crypto.randomUUID().replaceAll('-', '')}`;
  const { error } = await admin.from('payments').insert({
    reference,
    user_id: opts.userId,
    kind: opts.kind,
    plan_id: opts.planId ?? null,
    amount,
    currency: plan?.currency ?? CURRENCY,
  });
  if (error) throw error;
  if (opts.kind === 'deposit') {
    const { error: depositError } = await admin.rpc('record_deposit_intent', {
      p_plan_id: opts.planId,
      p_user: opts.userId,
      p_payment_intent: reference,
      p_amount: amount,
    });
    if (depositError) throw depositError;
  }

  const returnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paystack-return`;
  const tx = await paystack<{ authorization_url: string }>('transaction/initialize', {
    body: {
      email,
      amount,
      currency: plan?.currency ?? CURRENCY,
      reference,
      callback_url: returnUrl,
      // Subscriptions renew on the saved card, so they need a card.
      ...(plan ? { plan: plan.plan_code, channels: ['card'] } : {}),
      metadata: {
        user_id: opts.userId,
        kind: opts.kind,
        plan_id: opts.planId ?? null,
        cancel_action: `${returnUrl}?reference=${reference}`,
      },
    },
  });
  return { authorizationUrl: tx.authorization_url, reference };
}

export interface Transaction {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { customer_code?: string };
  plan?: string | { plan_code?: string } | null;
  plan_object?: { plan_code?: string };
}

function planCode(tx: Transaction): string | undefined {
  if (typeof tx.plan === 'string') return tx.plan || undefined;
  return tx.plan?.plan_code ?? tx.plan_object?.plan_code;
}

/** Sends a payment's money back; already-refunded payments count as done. */
export async function refund(reference: string): Promise<void> {
  try {
    await paystack('refund', { body: { transaction: reference } });
  } catch (err) {
    if (!/reversed|refunded|already/i.test(String(err))) throw err;
  }
  await admin.rpc('payment_refunded', { p_reference: reference });
}

/**
 * Applies a Paystack transaction to the database (idempotent). Called with
 * the result of /transaction/verify and with charge.success webhooks.
 * Returns the payment's state: success | pending | failed | refunded.
 */
export async function applyTransaction(tx: Transaction): Promise<string> {
  if (tx.status === 'failed') {
    await admin.rpc('payment_failed', { p_reference: tx.reference });
    return 'failed';
  }
  if (tx.status !== 'success') return 'pending';

  const plan = await getPlusPlan();
  const args = {
    p_reference: tx.reference,
    p_amount: tx.amount,
    p_currency: tx.currency,
    p_customer_code: tx.customer?.customer_code ?? null,
    p_plus_days: planDays(plan),
  };
  let { data: result, error } = await admin.rpc('payment_succeeded', args);
  if (!error && result === 'unknown' && plan && planCode(tx) === plan.plan_code && args.p_customer_code) {
    ({ data: result, error } = await admin.rpc('record_renewal', {
      p_customer_code: args.p_customer_code,
      p_reference: tx.reference,
      p_amount: tx.amount,
      p_currency: tx.currency,
      p_plus_days: args.p_plus_days,
    }));
  }
  if (error) throw error;
  if (result === 'refund') {
    await refund(tx.reference);
    return 'refunded';
  }
  return result === 'unknown' ? 'pending' : 'success';
}
