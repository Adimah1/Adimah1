// Scheduled job (every 10 minutes, Authorization: Bearer <CRON_SECRET>):
// refunds or keeps deposits for dates that are over, expired or cancelled,
// retries pending refunds, and purges old security telemetry.

import { admin, hasSharedSecret, json } from '../_shared/admin.ts';
import { refundDue, settlePlan } from '../_shared/settle.ts';

Deno.serve(async (req) => {
  if (!hasSharedSecret(req, 'CRON_SECRET')) return json({ error: 'unauthorized' }, 401);

  const { data, error } = await admin.rpc('plans_to_settle');
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, string | null> = {};
  for (const planId of (data ?? []) as string[]) {
    results[planId] = await settlePlan(planId).catch((e) => {
      console.error(e);
      return null;
    });
  }
  const refunded = await refundDue();
  await admin.rpc('purge_security_data');
  return json({ settled: results, refunded });
});
