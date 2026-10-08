// Push notifications for new matches and messages.
// Wire up database webhooks (INSERT on public.messages, public.matches and public.calls)
// pointing here, with header Authorization: Bearer <PUSH_WEBHOOK_SECRET>.
// Notification text never includes message content.

import { admin, hasSharedSecret, json, type WebhookPayload } from '../_shared/admin.ts';

interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  kind: 'text' | 'snap' | 'screenshot';
  held?: boolean;
}
interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  status: string;
}
interface MatchRow {
  id: string;
  user_a: string;
  user_b: string;
}

async function tokensFor(userIds: string[]): Promise<{ token: string; user_id: string }[]> {
  const { data, error } = await admin.from('push_tokens').select('token, user_id').in('user_id', userIds);
  if (error) throw error;
  return data ?? [];
}

async function send(messages: object[]): Promise<void> {
  if (messages.length === 0) return;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error('Expo push failed', res.status, await res.text());
  }
}

Deno.serve(async (req) => {
  if (!hasSharedSecret(req, 'PUSH_WEBHOOK_SECRET')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const payload = (await req.json()) as WebhookPayload<MessageRow | MatchRow | CallRow>;
  if (payload.type !== 'INSERT' || !payload.record) {
    return json({ skipped: true });
  }

  if (payload.table === 'matches') {
    const match = payload.record as MatchRow;
    const tokens = await tokensFor([match.user_a, match.user_b]);
    await send(
      tokens.map((t) => ({
        to: t.token,
        title: "It's a match! 💘",
        body: 'Say hi before the moment passes.',
        data: { matchId: match.id },
      })),
    );
    return json({ sent: tokens.length });
  }

  if (payload.table === 'calls') {
    const call = payload.record as CallRow;
    if (call.status !== 'ringing') return json({ skipped: true });
    const { data: caller } = await admin.from('profiles').select('display_name').eq('id', call.caller_id).single();
    const tokens = await tokensFor([call.callee_id]);
    await send(
      tokens.map((t) => ({
        to: t.token,
        title: 'Incoming video call',
        body: `${caller?.display_name ?? 'Someone'} is video calling you 📹`,
        sound: 'default',
        priority: 'high',
        data: { callId: call.id },
      })),
    );
    return json({ sent: tokens.length });
  }

  if (payload.table === 'messages') {
    const msg = payload.record as MessageRow;
    // Held messages (money requests, shadowbanned senders) are never delivered.
    if (msg.held) return json({ skipped: true });
    const { data: match, error } = await admin.from('matches').select('user_a, user_b').eq('id', msg.match_id).single();
    if (error || !match) {
      return json({ skipped: true });
    }
    const recipient = match.user_a === msg.sender_id ? match.user_b : match.user_a;
    const { data: sender } = await admin.from('profiles').select('display_name').eq('id', msg.sender_id).single();
    const name = sender?.display_name ?? 'Someone';
    const body = {
      text: `${name} sent you a message`,
      snap: `${name} sent you a snap 👀`,
      screenshot: `${name} took a screenshot of your chat`,
    }[msg.kind];

    const tokens = await tokensFor([recipient]);
    await send(
      tokens.map((t) => ({
        to: t.token,
        title: 'LushDate',
        body,
        data: { matchId: msg.match_id },
      })),
    );
    return json({ sent: tokens.length });
  }

  return json({ skipped: true });
});
