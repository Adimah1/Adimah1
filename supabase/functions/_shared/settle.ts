import { admin } from './admin.ts';
import { stripe } from './stripe.ts';

interface Settlement {
  outcome: string;
  release: string[];
  capture: string[];
}

/**
 * Runs the Stripe side of a date settlement, then records it. If any Stripe
 * call fails the plan is left as-is and retried on the next run.
 */
export async function settlePlan(planId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('settlement_for', { p_plan_id: planId });
  if (error) throw error;
  const s = data as Settlement;
  try {
    for (const intent of s.release) {
      await stripe(`payment_intents/${intent}/cancel`, {}, `release-${intent}`).catch((e) => {
        // Already cancelled/expired holds are fine to treat as released.
        if (!/cannot cancel|status of canceled/i.test(String(e))) throw e;
      });
    }
    for (const intent of s.capture) {
      await stripe(`payment_intents/${intent}/capture`, {}, `capture-${intent}`);
    }
  } catch (err) {
    console.error(`settlement of ${planId} failed, will retry`, err);
    return null;
  }
  const { data: outcome, error: finishError } = await admin.rpc('finish_settlement', { p_plan_id: planId });
  if (finishError) throw finishError;
  return outcome as string;
}
