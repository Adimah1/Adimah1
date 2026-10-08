// Places the caller's show-up deposit for a date: a Stripe authorization hold
// (capture_method=manual), never an immediate charge. Returns the client
// secret for the app's payment sheet, or { covered: true } when LushDate
// credit covers it.

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { planId } = (await req.json()) as { planId?: string };
  if (!planId) return json({ error: 'planId is required' }, 400);

  // Enforces KYC, account standing and plan state.
  const { data: due, error } = await admin.rpc('deposit_due', { p_user: user.id, p_plan_id: planId });
  if (error) return json({ error: error.message }, 403);

  if ((due as number) === 0) {
    const { error: creditError } = await admin.rpc('deposit_with_credit', { p_plan_id: planId, p_user: user.id });
    if (creditError) return json({ error: creditError.message }, 500);
    return json({ covered: true });
  }

  const intent = await stripe<{ id: string; client_secret: string }>(
    'payment_intents',
    {
      amount: due as number,
      currency: 'usd',
      capture_method: 'manual',
      'automatic_payment_methods[enabled]': 'true',
      description: 'LushDate show-up deposit (refunded when you check in)',
      'metadata[plan_id]': planId,
      'metadata[user_id]': user.id,
    },
    `deposit-${planId}-${user.id}`,
  );
  const { error: recordError } = await admin.rpc('record_deposit_intent', {
    p_plan_id: planId,
    p_user: user.id,
    p_payment_intent: intent.id,
    p_amount: due,
  });
  if (recordError) return json({ error: recordError.message }, 500);
  return json({ clientSecret: intent.client_secret });
});
