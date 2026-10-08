import { createClient } from 'npm:@supabase/supabase-js@2';

/** Service-role client. Bypasses RLS — only use it inside edge functions. */
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Checks `Authorization: Bearer <secret>` against an env var, for endpoints
 * called by database webhooks, cron jobs or third parties instead of users.
 */
export function hasSharedSecret(req: Request, envName: string): boolean {
  const secret = Deno.env.get(envName);
  if (!secret) {
    console.error(`${envName} is not set; rejecting request`);
    return false;
  }
  return req.headers.get('Authorization') === `Bearer ${secret}`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Shape of a Supabase database webhook payload. */
export interface WebhookPayload<T> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: T | null;
  old_record: T | null;
}
