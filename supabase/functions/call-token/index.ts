// Issues a LiveKit access token for a video call. The calls table decides who
// may join: the caller while the call is ringing or live, the person being
// called only once they've accepted. Starting a call (start_call) is where
// LushDate+ is enforced.
//
// Secrets: LIVEKIT_URL (wss://…), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.

import { SignJWT } from 'npm:jose@5';

import { admin, json } from '../_shared/admin.ts';

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

Deno.serve(async (req) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const {
    data: { user },
  } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) {
    console.error('LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET not set');
    return json({ error: 'video calls are not configured' }, 503);
  }

  const { callId } = (await req.json()) as { callId?: string };
  const { data: call } = await admin
    .from('calls')
    .select('id, caller_id, callee_id, status')
    .eq('id', callId ?? '')
    .maybeSingle();
  if (!call) {
    return json({ error: 'call not found' }, 404);
  }

  const isCaller = call.caller_id === user.id;
  const isCallee = call.callee_id === user.id;
  const allowed =
    (isCaller && (call.status === 'ringing' || call.status === 'accepted')) || (isCallee && call.status === 'accepted');
  if (!allowed) {
    return json({ error: 'this call is not available' }, 403);
  }

  const { data: profile } = await admin.from('profiles').select('display_name').eq('id', user.id).single();
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    name: profile?.display_name ?? 'LushDate',
    video: { room: `call-${call.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(apiKey)
    .setSubject(user.id)
    .setNotBefore(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(apiSecret));

  return json({ token, url });
});
