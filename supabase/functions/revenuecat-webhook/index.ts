// RevenueCat → LushDate+ entitlements and boosts.
//
// RevenueCat dashboard → Integrations → Webhooks:
//   URL:    https://<project>.supabase.co/functions/v1/revenuecat-webhook
//   Header: Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// The app calls Purchases.logIn(<supabase user id>), so app_user_id is our user id.
// Subscription state is always re-read from the RevenueCat API rather than trusted
// from the event, which makes retries, out-of-order delivery and transfers safe.

import { admin, hasSharedSecret, json } from '../_shared/admin.ts';

const PLUS_ENTITLEMENT = 'plus';
const BOOST_PRODUCT_PREFIX = 'boost';
const BOOST_MINUTES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
}

interface Subscriber {
  subscriber: {
    entitlements: Record<string, { expires_date: string | null; product_identifier: string }>;
  };
}

async function syncEntitlement(userId: string): Promise<void> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('REVENUECAT_SECRET_KEY')}` },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat API ${res.status} for ${userId}`);
  }
  const data = (await res.json()) as Subscriber;
  const plus = data.subscriber.entitlements[PLUS_ENTITLEMENT];
  // A null expiry means a lifetime purchase.
  const expiresAt = plus ? (plus.expires_date ?? '9999-12-31T00:00:00Z') : new Date().toISOString();

  const { error } = await admin.from('entitlements').upsert({
    user_id: userId,
    product_id: plus?.product_identifier ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (!hasSharedSecret(req, 'REVENUECAT_WEBHOOK_SECRET')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const { event } = (await req.json()) as { event: RevenueCatEvent };

  if (event.type === 'TEST') {
    return json({ ok: true });
  }

  const userIds = new Set(
    [event.app_user_id, ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])].filter(
      (id): id is string => !!id && UUID.test(id),
    ),
  );

  if (
    event.type === 'NON_RENEWING_PURCHASE' &&
    event.product_id?.startsWith(BOOST_PRODUCT_PREFIX) &&
    event.app_user_id &&
    UUID.test(event.app_user_id) &&
    event.transaction_id
  ) {
    const { error } = await admin.rpc('grant_boost', {
      p_user: event.app_user_id,
      p_transaction_id: event.transaction_id,
      p_minutes: BOOST_MINUTES,
    });
    if (error) {
      console.error('grant_boost failed', error);
      return json({ error: 'boost failed' }, 500);
    }
    return json({ ok: true });
  }

  try {
    for (const id of userIds) {
      await syncEntitlement(id);
    }
  } catch (err) {
    console.error(err);
    // Non-2xx makes RevenueCat retry.
    return json({ error: 'sync failed' }, 500);
  }
  return json({ ok: true });
});
