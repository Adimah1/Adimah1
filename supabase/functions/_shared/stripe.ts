// Minimal Stripe REST client (form-encoded), so no SDK is needed in Deno.

import { hmacSha256Hex, safeEqual } from './crypto.ts';

function form(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  return body.toString();
}

export async function stripe<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers, body: form(params) });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path}: ${data?.error?.message ?? res.status}`);
  }
  return data as T;
}

/** Verifies a Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => safeEqual(p.slice(3), expected));
}
