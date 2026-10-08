# LushDate

> See who’s actually around you. Chat in moments that vanish.

LushDate is a proximity dating app: a live feed of people nearby, mutual-like matching, chat with
view-once disappearing photo "snaps", and a LushDate+ subscription plus paid boosts.

This repository contains the MVP described in [`docs/MVP.md`](docs/MVP.md):

| Path | What it is |
|---|---|
| `app/` | iOS + Android app (Expo SDK 57, React Native, Expo Router, TypeScript) |
| `supabase/migrations/` | Postgres schema, privacy rules (RLS), and all server-side logic as SQL functions |
| `supabase/functions/` | Edge functions: RevenueCat webhook, snap purge, push notifications, photo checks, account deletion |
| `supabase/tests/` | Behavioural tests for the schema (137 checks) |
| `docs/MVP.md` | Product scope, what's deliberately deferred, legal checklist |

## Features

**Onboarding** — phone number sign-in (SMS code), 18+ age gate (enforced in the database too), name,
gender, who you want to see, what you're looking for, bio, 2–6 photos, location permission.

**Nearby** — a grid of people near you, sorted boosted → active now → closest. Radius chips
1/5/10/25 mi (free) and up to 100 mi with LushDate+. Only people whose preferences match yours both ways,
within each other's age ranges, who aren't paused, blocked or already swiped.

**Matching** — like/pass from a full profile view; a mutual like creates a match and opens chat.

**Chat** — realtime text chat plus **snaps**: photos that can be opened once, for 10 seconds, then
are deleted from storage. Screenshots are blocked on Android and reported to the other person on iOS.

**LushDate+** (subscription via RevenueCat) — video calls, see who liked you, 100-mile radius, incognito mode.

**Video calls** (LushDate+) — matches can video call from the chat screen. Only LushDate+ members can
*start* a call (enforced by the `start_call` database function); answering is free for everyone. Calls ring
on the other phone (in-app and by push notification), time out after 45 seconds, and include mute, camera
on/off and flip camera. Video runs through [LiveKit](https://livekit.io); the `call-token` function only
gives room access to the two people on an active call.
**Boosts** (consumable) — top of everyone's feed for 30 minutes.

**Trust & safety (zero trust)** — every location ping, message, account and payment is checked on the
server: spoofed/teleporting/VPN locations, money requests and off-platform payment pushes in chat,
scam-script patterns, rapid reports, duplicate IDs and ban evasion feed a risk score that shadowbans or
freezes accounts, with in-app appeals. Government ID + liveness unlocks money features. Full design,
thresholds and fallbacks: [`docs/SECURITY.md`](docs/SECURITY.md).

**Show-up deposits** — matched, ID-verified people can plan a date where both place the same refundable
card hold; checking in at the venue releases both, a no-show's deposit becomes credit for the person who
came. Money never moves between users.

**Safety** — panic button (blocks, deletes the chat, texts your emergency contact your location), report (with reasons) and block from any profile or chat; blocking is symmetric and
deletes the chat; pause profile; selfie verification with a blue check; safety tips and an emergency
call button; account deletion.

**Real photos only** — every profile photo is checked when it's uploaded. Drawings, cartoons,
AI-generated images, photos with no face, and nudity or gore are refused with a message saying why
(`check-photo`), and a webhook re-checks every upload so the rule can't be skipped (`moderate-photo`).
Selfie verification then confirms the photos are of the person using the account. Checks use
[Sightengine](https://sightengine.com); until its keys are set, photos are not checked. After creating the
account, upload one test photo and compare the response with `supabase/functions/_shared/photo-check.ts`.

### Privacy by design

- Raw GPS never reaches the database. `update_location()` snaps every position to a ~450 m grid
  before storing it, and other users only ever see a whole-mile distance ("Under 1 mi away").
- Locations, swipes and other people's profile rows can't be read through the API at all; the app goes
  through SQL functions that apply blocking, pausing, incognito and preference rules.
- Birthdate and verification status can't be changed by the client; snaps can only be downloaded by
  the recipient, once, within 2 minutes of opening.

## Getting started

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) and install the
   [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link and push the schema:
   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Auth → Providers → Phone**: enable phone sign-in and connect an SMS provider (Twilio, MessageBird,
   Vonage…). For local testing, `supabase/config.toml` defines the test number `+1 555 555 0100` with
   code `123456`.
4. Deploy the edge functions and set their secrets:
   ```sh
   supabase functions deploy
   supabase secrets set \
     REVENUECAT_WEBHOOK_SECRET=<random> \
     REVENUECAT_SECRET_KEY=<RevenueCat secret API key> \
     CRON_SECRET=<random> \
     PUSH_WEBHOOK_SECRET=<random> \
     MODERATION_WEBHOOK_SECRET=<random> \
     SIGHTENGINE_USER=<id> SIGHTENGINE_SECRET=<secret> \
     LIVEKIT_URL=wss://<your-project>.livekit.cloud LIVEKIT_API_KEY=<key> LIVEKIT_API_SECRET=<secret> \
     IPQS_API_KEY=<ipqualityscore key> GOOGLE_VISION_API_KEY=<key> \
     PERSONA_TEMPLATE_ID=itmpl_... PERSONA_ENVIRONMENT_ID=env_... PERSONA_WEBHOOK_SECRET=<secret> \
     IDENTITY_HASH_SALT=<long random string — never change it> \
     STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_... \
     TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=<token> TWILIO_FROM=+1...
   ```
5. **Database → Webhooks** — create three webhooks, each with the HTTP header
   `Authorization: Bearer <matching secret>`:

   | Table / event | Function URL | Secret |
   |---|---|---|
   | `public.messages` INSERT | `/functions/v1/push` | `PUSH_WEBHOOK_SECRET` |
   | `public.matches` INSERT | `/functions/v1/push` | `PUSH_WEBHOOK_SECRET` |
   | `public.calls` INSERT | `/functions/v1/push` | `PUSH_WEBHOOK_SECRET` |
   | `storage.objects` INSERT | `/functions/v1/moderate-photo` | `MODERATION_WEBHOOK_SECRET` |

   Also point **Stripe** (events `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.dispute.created`) at `/functions/v1/stripe-webhook`, and **Persona**
   inquiry events at `/functions/v1/kyc-webhook`.

6. **Scheduled snap cleanup** — enable the `pg_cron` and `pg_net` extensions, then run in the SQL editor:
   ```sql
   select cron.schedule('purge-snaps', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/purge-snaps',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     )
   $$);
   select cron.schedule('settle-dates', '*/10 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/settle-dates',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     )
   $$);
   ```

### 2. LiveKit (video calls)

Create a project at [cloud.livekit.io](https://cloud.livekit.io) (there's a free tier) and copy its
WebSocket URL, API key and API secret into the `LIVEKIT_*` secrets above. Nothing LiveKit-specific goes in
the app's `.env`.

### 3. RevenueCat (payments)

1. Create the products in App Store Connect and Google Play:
   a LushDate+ subscription (e.g. `plus_monthly`) and a consumable boost whose id starts with `boost`
   (e.g. `boost_30m`).
2. In RevenueCat: create an entitlement **`plus`** attached to the subscription(s); make the
   subscription packages your **current** offering; create an offering named **`boosts`** containing the
   boost product.
3. **Integrations → Webhooks**: URL `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`,
   authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>`.

The app logs in to RevenueCat with the Supabase user id, and the server's `entitlements` table (written
only by the webhook) is what actually unlocks features — the client can't grant itself LushDate+.

### 4. The app

```sh
cd app
npm install
cp .env.example .env   # fill in the Supabase URL + anon key and RevenueCat public keys
npx expo start
```

Location, camera, video calls, screenshot blocking, push and purchases need a **development build** rather than
Expo Go:

```sh
npx eas-cli@latest build --profile development --platform ios   # or android
```

Push notifications need an EAS project id (`npx eas-cli@latest init` adds it to `app.json`).

## Moderation (until there's an admin panel)

- **Reports**: Supabase Table Editor → `reports` (filter `status = open`). Set `status` to
  `actioned`/`dismissed`. To ban someone, delete their user under **Authentication → Users**.
- **Verification**: view the selfie in Storage → `verifications/<user id>/`, compare with their photos
  in `photos/<user id>/`, then run `select review_verification('<request id>', true);` (or `false`).

## Tests and checks

```sh
# App: types, lint, unit tests
cd app && npm run typecheck && npm run lint && npm test

# Database: runs the migration + 137 behavioural checks on a throwaway database.
# Needs a local Postgres 16 with PostGIS 3 (or set PGHOST/PGPORT/PGUSER).
supabase/tests/run.sh

# Edge functions
deno check supabase/functions/*/index.ts
```

The same checks run in GitHub Actions (`.github/workflows/ci.yml`).

## Not built yet (by design)

See [`docs/MVP.md`](docs/MVP.md#2-mvp-scope-v1): live map, stories/streaks, gifts that pay out cash,
paid dates/deposits/escrow and pay-to-unlock content are deferred. The cash-out and paid-date features
in particular need legal review before they're designed (money-transmission rules, app-store rules and
anti-trafficking laws such as FOSTA-SESTA).

Before a public launch you'll also need: a privacy policy and terms of service (linked from sign-in),
App Store / Play Store listings, an EAS project, and real SMS/moderation provider accounts.
