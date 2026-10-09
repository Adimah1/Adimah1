// Places the caller's show-up deposit for a date through Paystack. The
// deposit is charged now and refunded in full when both people check in (or
// the date is cancelled / expires). Returns a Paystack checkout, or
// { covered: true } when LushDate credit covers it.

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';
import { PaymentError, startCheckout } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { planId, email } = (await req.json()) as { planId?: string; email?: string };
  if (!planId) return json({ error: 'planId is required' }, 400);

  // Enforces KYC, account standing and plan state.
  const { data: due, error } = await admin.rpc('deposit_due', { p_user: user.id, p_plan_id: planId });
  if (error) return json({ error: error.message }, 403);

  if ((due as number) === 0) {
    const { error: creditError } = await admin.rpc('deposit_with_credit', { p_plan_id: planId, p_user: user.id });
    if (creditError) return json({ error: creditError.message }, 500);
    return json({ covered: true });
  }

  try {
    return json(await startCheckout({ userId: user.id, kind: 'deposit', amount: due as number, planId, email }));
  } catch (err) {
    if (err instanceof PaymentError) return json({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return json({ error: 'Payment service error. Please try again.' }, 500);
  }
});
