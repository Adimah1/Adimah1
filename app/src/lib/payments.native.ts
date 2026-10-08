import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

import { STRIPE_PUBLISHABLE_KEY } from './env';

export const depositsAvailable = STRIPE_PUBLISHABLE_KEY.length > 0;

let initialised = false;

export type PaymentResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

/** Shows Stripe's payment sheet for a deposit hold (an authorization, not a charge). */
export async function confirmDepositHold(clientSecret: string): Promise<PaymentResult> {
  if (!initialised) {
    await initStripe({
      publishableKey: STRIPE_PUBLISHABLE_KEY,
      urlScheme: 'lushdate',
      merchantIdentifier: 'merchant.com.lushdate.app',
    });
    initialised = true;
  }
  const init = await initPaymentSheet({
    merchantDisplayName: 'LushDate',
    paymentIntentClientSecret: clientSecret,
    returnURL: 'lushdate://stripe-redirect',
  });
  if (init.error) return { ok: false, cancelled: false, message: init.error.message };
  const result = await presentPaymentSheet();
  if (result.error) {
    return { ok: false, cancelled: result.error.code === 'Canceled', message: result.error.message };
  }
  return { ok: true };
}
