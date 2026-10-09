import { admin } from './admin.ts';
import { refund } from './paystack.ts';

interface Settlement {
  outcome: string;
  release: string[];
  capture: string[];
}

/**
 * Runs the money side of a date settlement, then records it. Deposits were
 * charged when placed, so "release" means a full Paystack refund and
 * "capture" means keeping the money. If a refund fails the plan is left
 * as-is and retried on the next run.
 */
export async function settlePlan(planId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('settlement_for', { p_plan_id: planId });
  if (error) throw error;
  const s = data as Settlement;
  try {
    if (s.release.length > 0) {
      const { data: paid } = await admin
        .from('payments')
        .select('reference')
        .in('reference', s.release)
        .eq('status', 'success');
      for (const { reference } of paid ?? []) await refund(reference);
    }
  } catch (err) {
    console.error(`settlement of ${planId} failed, will retry`, err);
    return null;
  }
  const { data: outcome, error: finishError } = await admin.rpc('finish_settlement', { p_plan_id: planId });
  if (finishError) throw finishError;
  return outcome as string;
}

/** Refunds payments that arrived too late or for the wrong amount. */
export async function refundDue(): Promise<number> {
  const { data } = await admin.from('payments').select('reference').eq('status', 'refund_due').limit(50);
  let done = 0;
  for (const { reference } of data ?? []) {
    await refund(reference).then(
      () => done++,
      (e) => console.error(`refund of ${reference} failed, will retry`, e),
    );
  }
  return done;
}
