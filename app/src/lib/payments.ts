/** Card payments (Stripe) run in the iOS/Android app; see payments.native.ts. */
export const depositsAvailable = false;

export type PaymentResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export async function confirmDepositHold(_clientSecret: string): Promise<PaymentResult> {
  return { ok: false, cancelled: false, message: 'Deposits are available in the LushDate iPhone and Android app.' };
}
