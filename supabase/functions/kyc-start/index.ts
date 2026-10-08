// Starts government-ID + liveness verification with Persona and returns the
// hosted flow URL to open in the app. Secrets: PERSONA_TEMPLATE_ID
// (itmpl_…) and PERSONA_ENVIRONMENT_ID (env_…). The webhook (kyc-webhook)
// records the result; the app never decides it.

import { admin, json } from '../_shared/admin.ts';
import { requestUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const user = await requestUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const template = Deno.env.get('PERSONA_TEMPLATE_ID');
  const environment = Deno.env.get('PERSONA_ENVIRONMENT_ID');
  if (!template || !environment) return json({ error: 'ID verification is not configured' }, 503);

  const { data: profile } = await admin.from('profiles').select('kyc_status').eq('id', user.id).single();
  if (profile?.kyc_status === 'approved') return json({ status: 'approved' });

  await admin
    .from('profiles')
    .update({ kyc_status: 'pending' })
    .eq('id', user.id)
    .in('kyc_status', ['none', 'rejected']);

  const params = new URLSearchParams({
    'inquiry-template-id': template,
    'environment-id': environment,
    'reference-id': user.id,
    'redirect-uri': 'lushdate://verify',
  });
  return json({ url: `https://withpersona.com/verify?${params}` });
});
