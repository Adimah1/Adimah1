// LushDate+ and boosts through Paystack, plus checking a payment's result.
// POST { action: 'prices' }                      → what things cost
// POST { action: 'plus' | 'boost', email? }       → { authorizationUrl, reference }
// POST { action: 'verify', reference }            → { status, kind }
// POST { action: 'manage' }                       → { link } to cancel / change card

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';
import {
  applyTransaction,
  BOOST_PRICE,
  CURRENCY,
  getPlusPlan,
  paystack,
  PaymentError,
  paystackConfigured,
  startCheckout,
  type Transaction,
} from '../_shared/paystack.ts';

interface Body {
  action?: string;
  email?: string;
  reference?: string;
}

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => ({}))) as Body;

  try {
    switch (body.action) {
      case 'prices': {
        if (!paystackConfigured()) return json({ available: false });
        const plan = await getPlusPlan().catch((e) => {
          console.error(e);
          return null;
        });
        return json({
          available: true,
          currency: CURRENCY,
          plus: plan ? { name: plan.name, amount: plan.amount, interval: plan.interval } : null,
          boost: { amount: BOOST_PRICE, minutes: 30 },
        });
      }
      case 'plus':
      case 'boost':
        return json(
          await startCheckout({
            userId: user.id,
            kind: body.action,
            amount: body.action === 'boost' ? BOOST_PRICE : undefined,
            email: body.email,
          }),
        );
      case 'verify': {
        const { data: payment } = await admin
          .from('payments')
          .select('kind, status')
          .eq('reference', body.reference ?? '')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!payment) return json({ error: 'payment not found' }, 404);
        if (payment.status === 'pending' || payment.status === 'failed') {
          const tx = await paystack<Transaction>(`transaction/verify/${encodeURIComponent(body.reference!)}`);
          await applyTransaction(tx);
        }
        const { data: now } = await admin.from('payments').select('status').eq('reference', body.reference!).single();
        return json({ kind: payment.kind, status: now?.status });
      }
      case 'manage': {
        const { data: customer } = await admin
          .from('billing_customers')
          .select('subscription_code')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!customer?.subscription_code) return json({ error: 'No Paystack subscription was found.' }, 404);
        const { link } = await paystack<{ link: string }>(
          `subscription/${encodeURIComponent(customer.subscription_code)}/manage/link`,
        );
        return json({ link });
      }
      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    if (err instanceof PaymentError) return json({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return json({ error: 'Payment service error. Please try again.' }, 500);
  }
});
