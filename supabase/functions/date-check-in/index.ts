// Checks someone in at their date's venue (within 250 m, inside the time
// window, with no spoofing signals). Settles right away once both are in.

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';
import { settlePlan } from '../_shared/settle.ts';
import { collectSignals, type DeviceSignals } from '../_shared/signals.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json()) as DeviceSignals & { planId?: string; lat?: number; lng?: number };
  if (!body.planId || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return json({ error: 'planId, lat and lng are required' }, 400);
  }

  const signals = await collectSignals(req, body);
  const { data, error } = await admin.rpc('record_check_in', {
    p_user: user.id,
    p_plan_id: body.planId,
    lat: body.lat,
    lng: body.lng,
    signals,
  });
  if (error) return json({ error: error.message }, 403);

  const result = data as { ok: boolean };
  if (result.ok) {
    const { count } = await admin
      .from('date_deposits')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', body.planId)
      .not('checked_in_at', 'is', null);
    if (count === 2) await settlePlan(body.planId);
  }
  return json(result);
});
