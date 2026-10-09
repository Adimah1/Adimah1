// Paystack sends the browser here after checkout (callback_url); this hands
// control back to the app, which then verifies the payment with the server.

const REFERENCE = /^[A-Za-z0-9_.=-]{1,100}$/;

Deno.serve((req) => {
  const url = new URL(req.url);
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? '';
  const target = REFERENCE.test(reference)
    ? `lushdate://paystack?reference=${encodeURIComponent(reference)}`
    : 'lushdate://paystack';
  return new Response(null, { status: 302, headers: { Location: target } });
});
