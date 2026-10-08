// Every location update goes through here so the server can add signals the
// device can't fake (IP reputation and rough IP location), then applies the
// location-integrity rules in record_location().

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';
import { collectSignals, type DeviceSignals } from '../_shared/signals.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json()) as DeviceSignals & { lat?: number; lng?: number };
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return json({ error: 'lat and lng are required' }, 400);
  }
  const signals = await collectSignals(req, body);
  const { data, error } = await admin.rpc('record_location', {
    p_user: user.id,
    lat: body.lat,
    lng: body.lng,
    signals,
  });
  if (error) {
    console.error(error);
    return json({ error: 'location update failed' }, 500);
  }
  return json(data);
});
