// Stripe → deposit state. Configure an endpoint for:
//   payment_intent.amount_capturable_updated, payment_intent.payment_failed,
//   payment_intent.canceled, charge.dispute.created
// Secret: STRIPE_WEBHOOK_SECRET.

import { admin, json } from '../_shared/admin.ts';
import { verifyStripeSignature } from '../_shared/stripe.ts';

interface StripeEvent {
  type: string;
  data: { object: { id: string; payment_intent?: string; metadata?: Record<string, string> } };
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const ok = await verifyStripeSignature(
    payload,
    req.headers.get('Stripe-Signature'),
    Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  );
  if (!ok) return json({ error: 'bad signature' }, 400);

  const event = JSON.parse(payload) as StripeEvent;
  const object = event.data.object;

  switch (event.type) {
    case 'payment_intent.amount_capturable_updated':
      await admin.rpc('mark_deposit', { p_payment_intent: object.id, p_status: 'authorized' });
      break;
    case 'payment_intent.payment_failed':
      await admin.rpc('mark_deposit', { p_payment_intent: object.id, p_status: 'failed' });
      break;
    case 'payment_intent.canceled':
      await admin.rpc('mark_deposit', { p_payment_intent: object.id, p_status: 'released' });
      break;
    case 'charge.dispute.created': {
      // A chargeback on a no-show capture: keep the evidence trail and score it.
      const intent = object.payment_intent;
      const { data: dep } = await admin
        .from('date_deposits')
        .select('user_id, plan_id')
        .eq('payment_intent', intent)
        .maybeSingle();
      if (dep) {
        await admin.rpc('apply_risk', {
          p_user: dep.user_id,
          p_kind: 'chargeback',
          p_weight: 40,
          p_detail: { plan: dep.plan_id, intent },
        });
      }
      break;
    }
  }
  return json({ received: true });
});
