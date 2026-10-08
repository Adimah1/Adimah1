import { IS_DEMO } from './env';

/** Card payments run in the iOS/Android app (Stripe); the web demo simulates them. */
export const depositsAvailable = IS_DEMO;

export type PaymentResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export async function confirmDepositHold(clientSecret: string): Promise<PaymentResult> {
  if (IS_DEMO || clientSecret === 'demo') return { ok: true };
  return { ok: false, cancelled: false, message: 'Deposits are available in the LushDate app.' };
}
