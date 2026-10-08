import { assert, assertEquals } from 'jsr:@std/assert@1';

import { hmacSha256Hex, safeEqual } from './crypto.ts';
import { verifyStripeSignature } from './stripe.ts';

Deno.test('hmacSha256Hex matches a known vector', async () => {
  // RFC 4231 test case 2.
  assertEquals(
    await hmacSha256Hex('Jefe', 'what do ya want for nothing?'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
});

Deno.test('safeEqual', () => {
  assert(safeEqual('abc', 'abc'));
  assert(!safeEqual('abc', 'abd'));
  assert(!safeEqual('abc', 'abcd'));
});

Deno.test('verifyStripeSignature accepts valid and rejects tampered or stale payloads', async () => {
  const secret = 'whsec_test';
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(secret, `${t}.${payload}`);
  assert(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret));
  assert(!(await verifyStripeSignature('{"id":"evt_2"}', `t=${t},v1=${sig}`, secret)));
  const old = t - 3600;
  const oldSig = await hmacSha256Hex(secret, `${old}.${payload}`);
  assert(!(await verifyStripeSignature(payload, `t=${old},v1=${oldSig}`, secret)));
  assert(!(await verifyStripeSignature(payload, null, secret)));
});
