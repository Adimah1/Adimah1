# LushDate security architecture

LushDate treats every account, message, location ping and payment as untrusted until the server has
checked it. The app never decides anything that matters (who is verified, where someone is, whether
a payment happened); it only collects input. The rules live in Postgres
(`supabase/migrations/20261008020000_trust_safety.sql`) and the edge functions in
`supabase/functions/`, and they are covered by the schema test suite (`supabase/tests/`).

The design goal is the one in the brief: make LushDate **expensive and annoying to scam on, without
punishing honest people**. So most signals add risk rather than block, enforcement escalates in
steps, a shadowban is invisible, and every automatic decision can be appealed to a person.

---

## 1. Trust tiers (progressive verification)

| Tier | How you get it | What it unlocks |
|---|---|---|
| 0 | Phone number (SMS code) + 18+ birthday + real face photos | Browsing, matching, chat, snaps |
| 1 | Selfie in a requested pose, compared with your photos by a reviewer | Blue check, more visibility |
| 2 | Government ID + liveness (selfie video) via KYC provider (Persona) | Date deposits; money requests are no longer held |

People only meet friction when they reach for something risky (money). Joining stays quick.

---

## 2. Identity (anti-catfish / anti-impersonation)

| Control | Where | Behaviour |
|---|---|---|
| Real-photo check on upload | `check-photo`, `moderate-photo`, `_shared/photo-check.ts` | Rejects nudity/gore, AI-generated images, drawings/cartoons, photos with no face, and **photos found elsewhere online** (Google Vision web detection). Explains why. |
| Upload backstop | `moderate-photo` webhook on `storage.objects` | Re-checks every upload, so skipping the app can't get a photo through. |
| Metadata stripping | `app/src/lib/upload.ts` | Every image is re-encoded to JPEG before upload, which strips EXIF (GPS, device, time). |
| ID + liveness | `kyc-start`, `kyc-webhook` | Hosted Persona flow. The result arrives only by signed webhook (HMAC, 5-minute replay window). |
| One person, one account | `identity_records.identity_hash` (unique) | Salted SHA-256 of document number + birthdate; the document itself is never stored. A second account with the same ID is refused (+60 risk) and the first is flagged (+20). |
| One device, banned stays banned | `devices`, `register_device()` | The app sends a hash of the per-install device id. A device used by a banned account freezes a new account (`ban_evasion`); one device on 4+ accounts adds risk. |
| Deepfake video | not built | Liveness from the KYC provider covers selfie video; add Reality Defender/Hive if user video uploads are ever added. |

---

## 3. Location integrity (anti-VPN / anti-spoofing)

Clients can no longer write a location directly (`update_location` is revoked). Every update goes
through `report-location` → `record_location()`:

| Signal | Source | Rule |
|---|---|---|
| Mock location | Device (`mocked` from Android/iOS) | **Rejected**, +30 risk, location not updated |
| Device integrity | Play Integrity / App Attest (see gaps) | `failed` → **rejected**, +25 |
| Impossible travel | Server: distance ÷ time since last accepted ping | > 900 km/h and > 50 km → **rejected**, +25 |
| VPN / proxy / Tor | Server: request IP via IPQualityScore | Allowed but **suspect**: stored as unverified, +3 |
| IP vs GPS mismatch | Server: IP geolocation | > 300 km → suspect, +3 |
| Low GPS accuracy | Device | > 3 km → suspect |
| Repeated spoofing | 3 rejected pings in 7 days | Account **frozen** (`location_spoofing`) |

Why the brief's "all three within 2 miles" rule isn't used: IP geolocation is often tens or hundreds of
miles off for mobile carriers, so a 2-mile rule would wrongly flag most honest people on cellular
data. IP is used as a coarse sanity check (300 km), and the hard rules use signals that are reliable.
Cell/Wi-Fi triangulation is what the OS already blends into the GPS fix.

Privacy is unchanged: only a point snapped to a ~450 m grid is stored, other people only see a whole-mile
distance, and raw pings are deleted after 30 days (`purge_security_data`).

---

## 4. Messages (every message is screened)

`messages_screen` runs on every insert:

| Detection | Rule |
|---|---|
| Money requests / payment rails (Cash App, $cashtags, Venmo, Zelle, PayPal, wire, gift cards, crypto, bank details, "send me money") | Low-trust senders (no ID verification, < 14 days old, or risk ≥ 30): message **held** — the sender sees "Not sent", the recipient never sees it; +15 risk. Verified senders: delivered with a warning to the recipient; +5. |
| Contact details (phone, email, links, WhatsApp/Telegram/Snapchat/Instagram) | Delivered with a "keep chatting on LushDate" note; +2 risk. Sharing a number with someone you like is normal; it only matters in combination. |
| Velocity | 20+ different matches messaged in an hour: +15 |
| Scripts | The same long message pasted to 4+ other matches in 24 h: +15 |
| Shadowbanned sender | Silently held: the sender sees it as sent, nobody else does. |

Held messages are excluded from push notifications and chat previews.

---

## 5. Behavioural fraud scoring and enforcement

Every signal is a row in `risk_events` (kind, weight, detail), also kept as evidence for disputes. The
score is the sum over 30 days, capped at 100.

| Score | State | What the person experiences |
|---|---|---|
| 0–59 | active | Normal |
| 60–89 | **shadowbanned** | Nothing visible. Their profile disappears from Nearby, likes and non-matches; new matches never form; their messages are held. `my_account_state()` still reports "active". |
| 90+ | **frozen** | "Your account is under review" screen with an appeal form; cannot swipe, message, call or pay. |
| — | banned | Set only by a human reviewer. |

**Rapid-report auto-freeze:** every report adds risk (scam/underage/safety reports weigh more), and 3+
different reporters within 24 hours freezes the account pending review.

Other weighted signals: no-show on a deposit date (+10), spoofed check-in (+30), chargeback (+40),
duplicate identity (+60), shared device (+20).

**Payments gate:** money features need tier 2, active status and risk < 40.

---

## 6. Payments: show-up deposits

**What the brief asked for, and what was built instead.** The brief described escrow that pays one user
once "the date/service happened". That was not built:

* Paying a person for a date is the pattern anti-prostitution and anti-trafficking laws (e.g.
  FOSTA-SESTA in the US) target, and app stores and payment processors ban it.
* Person-to-person payouts are the main channel romance scams use to get money out, and they make
  LushDate a money transmitter (licensing, AML/OFAC screening of every payout).

**Show-up deposits** keep the anti-flake benefit without either problem:

1. Two matched, ID-verified people agree on a public place, a time 1 hour to 6 days ahead, and a deposit
   ($5–$25 for accounts under 30 days, up to $100 after).
2. Each places the **same** deposit as a Stripe authorization hold (`capture_method=manual`) — nothing is
   charged. Credit from a previous date can cover it.
3. Check-in opens 30 minutes before and closes 90 minutes after the start time, and requires being within
   250 m of the venue, with no spoofing signals. Only the distance is stored.
4. Settlement (`settle-dates`, every 10 minutes, or immediately once both check in):
   * both checked in → both holds released, nothing charged;
   * one checked in → the no-show's hold is captured, and the person who came receives the same amount as
     **LushDate credit** (not cash) for their next deposit;
   * neither → both released.
5. Either person can dispute within 48 hours; a reviewer can refund.

Money only ever flows from a user to LushDate, never between users, so there are no payouts to launder
or scam. Stripe Radar handles card fraud. Limits: one open date per chat, 3 open dates per person,
5 proposals per day. Chargebacks add risk and are logged with the plan, check-ins and chat as evidence.

Off-platform payment attempts in chat are handled in section 4.

---

## 7. Privacy and personal safety

| Control | Where |
|---|---|
| Fuzzy location (~450 m grid, whole-mile distances) | `snap_point`, feed functions |
| Ghost mode (pause), Incognito (LushDate+) | Me tab |
| View-once snaps, screenshot blocking (Android) / alerts (iOS) | Chat |
| **Panic button** ("I feel unsafe" in any chat or profile menu) | Blocks the person, deletes the chat, texts the emergency contact a map link to your location (Twilio), offers an emergency call |
| Emergency contact | Safety screen; stored on the profile, readable only by its owner |
| EXIF stripping | Every upload |
| Shadowban never revealed | Risk columns are not readable by clients (column-level grants) |
| Security data retention | Location pings 30 days, risk events 180 days |

---

## 8. Moderation, appeals and accountability

* **Automatic:** photo screening, message screening, risk ladder, rapid-report freeze.
* **Human review:** `reports`, `verification_requests`, `appeals`, disputed dates. Reviewer actions go
  through `review_account(user, 'restore' | 'freeze' | 'ban' | 'shadowban', note)` and are written to
  `security_audit`.
* **Appeals:** any frozen account can appeal in-app; restoring clears the 30-day score so the ladder
  doesn't re-trigger, and accepts the appeal.
* **Audit log:** status changes, KYC results, deposits and settlements are recorded in `security_audit`
  (kept after account deletion for legal holds).
* **Law-enforcement requests and transparency reports** are processes, not code: publish a
  law-enforcement guide with a dedicated email, require legal process, and publish counts quarterly from
  `security_audit` and `reports`.

---

## 9. Fallbacks (when a check is wrong or a vendor is down)

| Situation | Fallback |
|---|---|
| False positive freeze | In-app appeal → human review → `review_account(..., 'restore')` resets the score. |
| VPN for a legitimate reason | Allowed; location just isn't marked verified. Small risk only. |
| GPS glitch looks like teleporting | One event is a rejection, not a freeze; it takes 3 in 7 days. |
| Score creep from old events | Scores only count 30 days; a shadowban lifts automatically below 40. |
| IP-intelligence service down | Fails open on the IP check only; device and velocity rules still apply. |
| Photo-checking service down/unset | `check-photo` reports an error and the app asks to retry; the webhook re-checks when it's back. Without keys, photos are not checked (logged loudly). |
| KYC webhook missing fields | Inquiry left in manual review, never auto-approved. |
| Stripe call fails during settlement | Plan left unchanged and retried on the next run; idempotency keys prevent double captures. |
| Hold expires (7-day Stripe limit) | Dates are capped at 6 days ahead; settlement treats an expired hold as released. |
| SMS provider down on panic | The person is still blocked and the chat deleted; the app offers an emergency call. |
| Shared family phone | Device rule only adds risk below 4 accounts and freezes only for a *banned* account's device. |

---

## 10. What's real, what needs keys, what isn't built yet

Implemented and tested in this repo: everything in sections 4–9 and the server-side logic of 2–3
(137 schema checks, signature unit tests).

Needs accounts and secrets before it runs (see README → Getting started):
`IPQS_API_KEY`, `GOOGLE_VISION_API_KEY`, `SIGHTENGINE_*`, `PERSONA_*`, `IDENTITY_HASH_SALT`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_*`, plus `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the app.

Not built yet:

* **Device attestation** (Play Integrity / App Attest). The server already rejects `attestation:
  "failed"`, but the app currently reports `"unavailable"`. Adding it needs a native module and
  server-side token verification with Google/Apple.
* **Rooted/jailbroken device detection** — comes with attestation.
* **ML scoring.** The current engine is rule-based and transparent; the same `risk_events` table is the
  training data for a model later.
* **Social account linking** ("Verified Human" badge).
* **Admin dashboard** — review is through the Supabase dashboard and the `review_account` function.

Deliberately not built:

* **Pay-the-other-person escrow and cash-out gifts** — section 6.
* **Honeypot fake profiles.** Real users would match with and confide in fake people, which is
  deceptive and has drawn regulator action against dating apps. Scam scripts are caught by the
  copy-paste, velocity and payment detectors instead.

---

## 11. Before launch

* Legal review of deposits and KYC data handling (FinCEN money-services rules don't apply while there
  are no payouts, but confirm; GDPR/CCPA for ID and location data; BIPA in Illinois for face data).
* App Store: deposits for meeting in person are a real-world service, so Stripe is permitted rather than
  in-app purchase; confirm during review.
* Write the privacy policy sections for KYC, location telemetry retention and safety moderation.
* Budget: identity, IP intelligence and moderation vendors are per-call; expect them to be a large share of
  running costs.
