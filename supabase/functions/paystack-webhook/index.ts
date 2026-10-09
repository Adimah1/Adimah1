// Paystack → payments. Paystack dashboard → Settings → API Keys & Webhooks:
//   Webhook URL: https://<project>.supabase.co/functions/v1/paystack-webhook
// Requests are signed with the secret key (x-paystack-signature).
// Each charge is re-verified with the Paystack API before it's applied.

import { admin, json } from '../_shared/admin.ts';
import { applyTransaction, paystack, type Transaction, verifyPaystackSignature } from '../_shared/paystack.ts';

interface PaystackEvent {
  event: string;
  data: {
    reference?: string;
    transaction_reference?: string;
    transaction?: { reference?: string };
    subscription_code?: string;
    email_token?: string;
    customer?: { customer_code?: string };
  };
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const ok = await verifyPaystackSignature(
    payload,
    req.headers.get('x-paystack-signature'),
    Deno.env.get('PAYSTACK_SECRET_KEY') ?? '',
  );
  if (!ok) return json({ error: 'bad signature' }, 401);

  const { event, data } = JSON.parse(payload) as PaystackEvent;
  try {
    switch (event) {
      case 'charge.success':
        if (data.reference) {
          await applyTransaction(
            await paystack<Transaction>(`transaction/verify/${encodeURIComponent(data.reference)}`),
          );
        }
        break;
      case 'subscription.create':
        if (data.customer?.customer_code && data.subscription_code) {
          await admin
            .from('billing_customers')
            .update({
              subscription_code: data.subscription_code,
              email_token: data.email_token ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('customer_code', data.customer.customer_code);
        }
        break;
      case 'refund.processed':
        if (data.transaction_reference) {
          await admin.rpc('payment_refunded', { p_reference: data.transaction_reference });
        }
        break;
      case 'charge.dispute.create': {
        const reference = data.transaction?.reference;
        if (reference) await admin.rpc('payment_disputed', { p_reference: reference });
        break;
      }
    }
  } catch (err) {
    console.error(event, err);
    // Non-2xx makes Paystack retry.
    return json({ error: 'failed' }, 500);
  }
  return json({ received: true });
});
