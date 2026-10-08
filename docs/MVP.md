# Near — MVP Plan

> "Snapchat meets Tinder, with a wallet. See who's actually around you."

This is the cheapest path to a launchable v1 in **one city**. The goal of the MVP is to answer one question:
**will people in a dense area open the app to see who's nearby and actually chat/meet?**
Everything that doesn't help answer that is deferred.

---

## 1. Guiding principles

1. **Density over features.** Launch in one city (ideally one campus or neighborhood first). An empty feed kills the app faster than any missing feature.
2. **Only take money in ways the App Store already approves.** Subscriptions and boosts through in-app purchase. Nothing that pays users out in cash until there's legal sign-off (see §5).
3. **Safety ships on day one.** A proximity app without location fuzzing and blocking is a stalking tool. These are not "v2."
4. **Buy, don't build.** Auth, realtime, storage, payments, and moderation all come from managed services.

---

## 2. MVP scope (v1)

### Must have

| Area | Feature | Notes |
|---|---|---|
| **Onboarding** | Phone number sign-in (OTP) | Cuts down on bots more than email does |
| | 18+ age gate + date of birth | Required. Block under-18 users outright |
| | Profile: 2–6 photos, name, age, short bio, what you're looking for | Keep it short so new users get to the feed fast |
| | Photo verification (selfie pose match) | Gives a "verified" badge. Use a vendor, not custom ML |
| **Proximity feed** | Grid of nearby users sorted by distance | **Grid only, no live map in v1** |
| | Radius slider: 1 / 5 / 10 mi / city | Free tier capped at 5 mi |
| | "Active now" badge (opened app in last 30 min) | Gives the "who's around right now" urgency without exact location |
| | Approximate distance only ("< 1 mi", "3 mi") | Location fuzzed server-side; exact coordinates never sent to clients |
| **Matching** | Like / pass; mutual like = match | Chat is gated on a match, which cuts harassment |
| **Messaging** | 1:1 text chat between matches | Realtime |
| | Disappearing photos: view once, then deleted | Kept server-side only until viewed or 24h, whichever comes first |
| | Screenshot alerts | Android: block with `FLAG_SECURE`. iOS: detect and notify the sender (iOS can't block screenshots) |
| **Safety** | Block + report (from profile and chat) | Blocking hides both users from each other everywhere |
| | Incognito / pause profile | Free. Lets users safely leave the feed |
| | Automated image moderation on upload | Nudity/violence classifier (AWS Rekognition, Hive, or Sightengine) |
| | Admin moderation queue | A simple internal web page is enough |
| **Monetization** | **Near+ subscription** (IAP) | See who liked you, unlimited radius, incognito browsing |
| | **Boosts** (IAP consumable) | Shown at top of nearby feeds for 30 min |

### Explicitly NOT in v1

| Deferred feature | Why it waits |
|---|---|
| Live map view | Biggest privacy risk. Grid plus fuzzed distance gives most of the value |
| Stories / streaks | Engagement features. Only matter once people are retained |
| Virtual gifts that convert to cash | Payout licensing, Apple's 30% cut, and escort-law exposure (see §5) |
| Paid dates / deposits / escrow | Highest legal risk in the whole concept. Needs a lawyer first |
| Pay-to-unlock private content | Turns the app into an adult-content platform in the eyes of Apple, Google, and payment processors |
| Local business ads | Need user density before any business will pay |
| ID verification for payouts | Only needed once payouts exist |
| Panic button / date check-in | Build it in v1.1 along with in-person date features |

---

## 3. Recommended stack (cheapest to ship)

| Layer | Choice | Why |
|---|---|---|
| App | **React Native + Expo** | One codebase for iOS and Android, over-the-air updates |
| Backend | **Supabase** (Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions) | Geo queries, chat realtime, phone auth, and photo storage in one service, with a free tier |
| Geo queries | PostGIS `ST_DWithin` on a **snapped/fuzzed** location column | Simpler and more accurate than Firebase geohash workarounds |
| In-app purchases | **RevenueCat** | Handles Apple + Google subscriptions and receipt validation |
| Push | Expo Notifications | Free |
| Moderation | Sightengine or Hive (images), plus manual queue | Pay per call |
| Selfie verification | Persona / Veriff / AWS Rekognition face compare | Vendor-based |
| Analytics | PostHog | Free tier, funnels + retention |

Add Stripe Connect **later**, only when payouts to users are legally cleared.

---

## 4. Core data model (sketch)

```
users            id, phone, dob, verified, is_paused, created_at
profiles         user_id, name, bio, looking_for, photos[]
locations        user_id, geo_fuzzed (geography), updated_at   -- snapped to ~400m grid + jitter
likes            from_user, to_user, created_at
matches          id, user_a, user_b, created_at
messages         id, match_id, sender_id, type(text|snap), body, media_path, viewed_at, expires_at
blocks           blocker_id, blocked_id
reports          reporter_id, reported_id, reason, context_ref, status
entitlements     user_id, tier, expires_at          -- written by RevenueCat webhook
boosts           user_id, starts_at, ends_at
```

Key rules enforced server-side (Row Level Security + Edge Functions):
- The feed query excludes blocked users in both directions, paused users, and users outside the requester's age/preference filters.
- Raw GPS is never stored. Only the fuzzed point is stored, and the client only ever sees a rounded distance bucket.
- A snap's media is deleted from storage when it is viewed or at `expires_at`, whichever comes first.

---

## 5. Legal / platform checklist before adding the money features

- [ ] **Gifts → cash:** Paying users out is money transmission in many places. Use Stripe Connect as the payout provider, and get a lawyer to confirm in-app gifts aren't treated as payment for companionship.
- [ ] **Paid dates / deposits:** Talk to a lawyer **before** designing it. Payment tied to meeting someone is exactly what anti-prostitution and anti-trafficking laws (e.g. FOSTA-SESTA in the US) target. Apple and Google also review this closely.
- [ ] **Apple/Google cut:** 15–30% on all digital goods (subs, boosts, gifts). Price with that built in.
- [ ] **Privacy:** Privacy policy, data deletion flow (required by both app stores), GDPR/CCPA if applicable. Location data is sensitive data.
- [ ] **Age:** 18+ only. App Store rating 17+.

---

## 6. Build order (~10–12 weeks, 1–2 devs)

| Week | Milestone |
|---|---|
| 1–2 | Expo app shell, Supabase project, phone auth, profile creation + photo upload with moderation |
| 3–4 | Location capture + fuzzing, nearby grid feed, radius filter, "active now" |
| 5 | Like/pass, matches, block/report |
| 6–7 | Realtime chat, disappearing photos, screenshot handling, push notifications |
| 8 | Selfie verification, admin moderation page |
| 9 | RevenueCat: Near+ subscription and boosts, paywall screens |
| 10 | Analytics, privacy policy, account deletion, App Store / Play submission |
| 11–12 | Closed beta in one neighborhood/campus (target 300–500 users) → fix → public city launch |

---

## 7. Metrics that decide whether to keep going

| Metric | Target for go |
|---|---|
| Users with ≥ 10 profiles in default radius | > 80% |
| Day-7 retention | > 25% |
| Matches that exchange ≥ 5 messages | > 30% |
| Free → Near+ conversion | > 3% |
| Reports per 1,000 active users / week | Trending down |

If density and retention are there, build v1.1: stories, panic button/date check-in, and the map view (opt-in, fuzzed).
After that, with legal sign-off, build v2: gifts with payouts.
