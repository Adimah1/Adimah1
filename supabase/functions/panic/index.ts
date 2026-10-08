// Panic button: texts the user's emergency contact with their location.
// The app blocks the other person and ends the chat before calling this.
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { lat, lng } = (await req.json().catch(() => ({}))) as { lat?: number; lng?: number };

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, emergency_contact_name, emergency_contact_phone')
    .eq('id', user.id)
    .single();
  await admin.from('security_audit').insert({ user_id: user.id, actor: 'user', action: 'panic', detail: {} });

  if (!profile?.emergency_contact_phone) return json({ notified: false, reason: 'no_contact' });

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || !from) return json({ notified: false, reason: 'sms_not_configured' });

  const where =
    typeof lat === 'number' && typeof lng === 'number' ? ` Location: https://maps.google.com/?q=${lat},${lng}` : '';
  const text =
    `LushDate safety alert: ${profile.display_name} pressed the panic button at ` +
    `${new Date().toUTCString()}.${where} Please check on them, or call emergency services.`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: profile.emergency_contact_phone, From: from, Body: text }),
  });
  if (!res.ok) {
    console.error('Twilio error', res.status, await res.text());
    return json({ notified: false, reason: 'sms_failed' });
  }
  return json({ notified: true });
});
