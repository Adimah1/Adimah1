import { FunctionsHttpError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

export { formatNaira, intervalLabel } from './format';

/** Where the paystack-return function sends the browser after checkout. */
const RETURN_URL = 'lushdate://paystack';
const EMAIL_CODES = ['email_required', 'email_invalid', 'email_taken'];

export type PaymentResult =
  | { ok: true; covered?: boolean }
  | { ok: false; cancelled: boolean; message: string; needEmail?: boolean };

export interface Prices {
  available: boolean;
  currency?: string;
  plus?: { name: string; amount: number; interval: string } | null;
  boost?: { amount: number; minutes: number };
}

/** Calls a payment function, reading the JSON error body on failure. */
async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error) {
    let detail: { error?: string; code?: string } = {};
    if (error instanceof FunctionsHttpError) detail = await error.context.json().catch(() => ({}));
    throw Object.assign(new Error(detail.error ?? error.message), { code: detail.code });
  }
  return data as T;
}

export async function getPrices(): Promise<Prices> {
  return call<Prices>('payments', { action: 'prices' });
}

async function verify(reference: string): Promise<string> {
  const { status } = await call<{ status: string }>('payments', { action: 'verify', reference });
  return status;
}

/**
 * Starts a Paystack checkout (fn = 'payments' or 'date-deposit'), opens it in
 * the in-app browser and checks the outcome with the server afterwards.
 */
export async function checkout(fn: string, body: Record<string, unknown>): Promise<PaymentResult> {
  let start: { authorizationUrl?: string; reference?: string; covered?: boolean };
  try {
    start = await call(fn, body);
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code && EMAIL_CODES.includes(err.code)) {
      return { ok: false, cancelled: false, needEmail: true, message: err.message };
    }
    return { ok: false, cancelled: false, message: err.message };
  }
  if (start.covered) return { ok: true, covered: true };
  if (!start.authorizationUrl || !start.reference) {
    return { ok: false, cancelled: false, message: 'Couldn’t start the payment. Please try again.' };
  }

  const browser = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, RETURN_URL);

  // Paystack can take a moment to confirm, so check a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const status = await verify(start.reference).catch(() => 'pending');
    if (status === 'success') return { ok: true };
    if (status === 'failed') return { ok: false, cancelled: false, message: 'The payment didn’t go through.' };
    if (status === 'refunded' || status === 'refund_due') {
      return { ok: false, cancelled: false, message: 'This payment couldn’t be used, so it’s being refunded.' };
    }
    if (browser.type !== 'success') break; // closed without paying
    await new Promise((r) => setTimeout(r, 2000));
  }
  return browser.type === 'success'
    ? {
        ok: false,
        cancelled: false,
        message: 'Your payment is still processing. It will show up here as soon as Paystack confirms it.',
      }
    : { ok: false, cancelled: true, message: '' };
}

/** Opens Paystack's page for cancelling LushDate+ or changing the card. */
export async function manageSubscription(): Promise<void> {
  const { link } = await call<{ link: string }>('payments', { action: 'manage' });
  await WebBrowser.openBrowserAsync(link);
}
