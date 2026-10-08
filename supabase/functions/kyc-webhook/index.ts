// Persona inquiry results → verification tier. Webhook secret:
// PERSONA_WEBHOOK_SECRET; identity hashing salt: IDENTITY_HASH_SALT.
// The person's document number and birthdate are hashed (never stored) so
// one person can't hold two accounts. Check the field names below against
// your Persona inquiry template; without them the inquiry goes to manual
// review instead of being approved.

import { admin, json } from '../_shared/admin.ts';
import { hmacSha256Hex, safeEqual, sha256Hex } from '../_shared/crypto.ts';

interface PersonaEvent {
  data: {
    attributes: {
      name: string;
      payload: {
        data: {
          id: string;
          attributes: {
            status: string;
            'reference-id'?: string;
            fields?: Record<string, { value?: string | null }>;
          };
        };
      };
    };
  };
}

async function verify(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('PERSONA_WEBHOOK_SECRET');
  const header = req.headers.get('Persona-Signature');
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return safeEqual(parts.v1, await hmacSha256Hex(secret, `${parts.t}.${body}`));
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(req, body))) return json({ error: 'bad signature' }, 400);

  const event = JSON.parse(body) as PersonaEvent;
  const inquiry = event.data.attributes.payload.data;
  const userId = inquiry.attributes['reference-id'];
  if (!userId) return json({ skipped: true });

  const name = event.data.attributes.name;
  if (name === 'inquiry.approved') {
    const fields = inquiry.attributes.fields ?? {};
    const idNumber = fields['identification-number']?.value?.replace(/\s+/g, '').toUpperCase();
    const birthdate = fields['birthdate']?.value;
    if (!idNumber || !birthdate) {
      console.warn(`inquiry ${inquiry.id}: no document number/birthdate fields; leaving for manual review`);
      await admin.rpc('set_kyc_result', { p_user: userId, p_status: 'pending', p_reference: inquiry.id });
      return json({ review: true });
    }
    const hash = await sha256Hex(`${Deno.env.get('IDENTITY_HASH_SALT') ?? ''}:${idNumber}:${birthdate}`);
    const { data } = await admin.rpc('set_kyc_result', {
      p_user: userId,
      p_status: 'approved',
      p_reference: inquiry.id,
      p_identity_hash: hash,
    });
    return json({ result: data });
  }
  if (name === 'inquiry.declined' || name === 'inquiry.failed') {
    await admin.rpc('set_kyc_result', { p_user: userId, p_status: 'rejected', p_reference: inquiry.id });
  }
  return json({ received: true });
});
