import { assert, assertEquals } from 'jsr:@std/assert@1';

import { hmacSha256Hex, hmacSha512Hex, safeEqual, verifyPaystackSignature } from './crypto.ts';

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

Deno.test('hmacSha512Hex matches a known vector', async () => {
  // RFC 4231 test case 2.
  assertEquals(
    await hmacSha512Hex('Jefe', 'what do ya want for nothing?'),
    '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
  );
});

Deno.test('verifyPaystackSignature accepts valid and rejects tampered payloads', async () => {
  const secret = 'sk_test_x';
  const payload = '{"event":"charge.success"}';
  const sig = await hmacSha512Hex(secret, payload);
  assert(await verifyPaystackSignature(payload, sig, secret));
  assert(await verifyPaystackSignature(payload, sig.toUpperCase(), secret));
  assert(!(await verifyPaystackSignature('{"event":"charge.failed"}', sig, secret)));
  assert(!(await verifyPaystackSignature(payload, null, secret)));
  assert(!(await verifyPaystackSignature(payload, sig, '')));
});
