/**
 * An in-memory stand-in for the Supabase client, used when EXPO_PUBLIC_DEMO=1.
 * It implements only the calls the app makes, mirrors the server rules that
 * matter for the experience (feed filters, matching, view-once snaps, plus
 * limits), and makes the pretend people reply. Nothing leaves the device.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { ageFrom } from '../format';
import type { Gender } from '../types';
import { DEMO_PEOPLE, DEMO_REPLIES, placeholderPhoto, portrait, snapScene, type DemoPerson } from './data';

type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null };

const ME = 'demo-me';

// Same idea as the server's mentions_payment() / mentions_contact().
const PAYMENT_PATTERN =
  /cash ?app|(^|\s)\$[a-z][a-z0-9_]{2,}|venmo|zelle|pay ?pal|western union|gift ?cards?|bitcoin|crypto|send (me )?(some )?money|bank (details|account)/i;
const CONTACT_PATTERN =
  /\+?\d[\d\s().-]{7,}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/|whats ?app|telegram|snapchat|instagram/i;
const DEMO_CODE = '123456';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

const PRIMARY_KEYS: Record<string, string> = {
  entitlements: 'user_id',
  push_tokens: 'token',
};

interface Handler {
  table: string;
  event: string;
  filter?: string;
  cb: (payload: { eventType: string; new: Row }) => void;
}

class DemoDb {
  tables: Record<string, Row[]> = {};
  files = new Map<string, string>();
  channels = new Set<{ handlers: Handler[] }>();
  replyIndex = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.tables = {
      profiles: DEMO_PEOPLE.map((p) => ({
        id: p.id,
        display_name: p.display_name,
        birthdate: p.birthdate,
        gender: p.gender,
        interested_in: p.interested_in,
        bio: p.bio,
        looking_for: p.looking_for,
        photos: [0, 1, 2].map((n) => `demo/${p.id}/${n}`),
        age_min: 18,
        age_max: 99,
        is_paused: false,
        incognito: false,
        verified: p.verified,
      })),
      swipes: [],
      matches: [],
      messages: [],
      blocks: [],
      reports: [],
      entitlements: [],
      boosts: [],
      verification_requests: [],
      push_tokens: [],
      calls: [],
      date_plans: [],
      date_deposits: [],
    };
  }

  person(id: string): DemoPerson | undefined {
    return DEMO_PEOPLE.find((p) => p.id === id);
  }

  profile(id: string): Row | undefined {
    return this.tables.profiles.find((p) => p.id === id);
  }

  notify(table: string, eventType: 'INSERT' | 'UPDATE', row: Row) {
    for (const channel of this.channels) {
      for (const h of channel.handlers) {
        if (h.table !== table || (h.event !== '*' && h.event !== eventType)) continue;
        if (h.filter) {
          const [col, value] = h.filter.split('=eq.');
          if (String(row[col]) !== value) continue;
        }
        h.cb({ eventType, new: { ...row } });
      }
    }
  }

  isBlocked(a: string, b: string) {
    return this.tables.blocks.some(
      (x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a),
    );
  }

  hasPlus() {
    const e = this.tables.entitlements.find((x) => x.user_id === ME);
    return !!e && e.expires_at > new Date().toISOString();
  }

  matchBetween(a: string, b: string) {
    return this.tables.matches.find((m) => (m.user_a === a && m.user_b === b) || (m.user_a === b && m.user_b === a));
  }

  otherIn(match: Row) {
    return match.user_a === ME ? match.user_b : match.user_a;
  }

  // ---- table writes with the same defaults/rules as the real triggers ----

  insert(table: string, input: Row): Result {
    const row: Row = { ...input };
    if (table === 'profiles') {
      if (ageFrom(row.birthdate) < 18) return fail('LushDate is only for adults 18 and over');
      Object.assign(row, {
        age_min: 18,
        age_max: 99,
        is_paused: false,
        incognito: false,
        verified: false,
        verification_tier: 0,
        kyc_status: 'none',
        emergency_contact_name: null,
        emergency_contact_phone: null,
        ...input,
      });
      this.tables.profiles.push(row);
      this.seedFor(row);
      return ok(row);
    }
    if (table === 'messages') {
      Object.assign(row, {
        id: uid(),
        created_at: new Date().toISOString(),
        viewed_at: null,
        expires_at: row.kind === 'snap' ? new Date(Date.now() + 86_400_000).toISOString() : null,
        body: row.kind === 'text' ? row.body : null,
        media_path: row.kind === 'snap' ? row.media_path : null,
        held: false,
        held_reason: null,
        flags: [],
      });
      // Mirror the server's screening: money requests from accounts without
      // a verified ID are held, contact details are flagged.
      if (row.kind === 'text') {
        const me = this.profile(row.sender_id);
        if (PAYMENT_PATTERN.test(row.body)) {
          row.flags.push('payment');
          if ((me?.verification_tier ?? 0) < 2) Object.assign(row, { held: true, held_reason: 'payment' });
        }
        if (CONTACT_PATTERN.test(row.body)) row.flags.push('contact');
      }
      this.tables.messages.push(row);
      this.notify('messages', 'INSERT', row);
      if (row.sender_id === ME && !row.held) this.scheduleReaction(row);
      return ok(row);
    }
    if (table === 'reports' || table === 'verification_requests') {
      Object.assign(row, {
        id: uid(),
        created_at: new Date().toISOString(),
        status: table === 'reports' ? 'open' : 'pending',
      });
      if (table === 'verification_requests') setTimeout(() => this.approveVerification(row), 4000);
    }
    this.tables[table].push(row);
    return ok(row);
  }

  approveVerification(row: Row) {
    row.status = 'approved';
    const me = this.profile(ME);
    if (me) me.verified = true;
  }

  // The pretend person reacts: replies to texts, opens snaps.
  scheduleReaction(msg: Row) {
    const match = this.tables.matches.find((m) => m.id === msg.match_id);
    if (!match) return;
    const other = this.otherIn(match);
    if (msg.kind === 'text') {
      setTimeout(() => {
        if (!this.tables.matches.includes(match)) return;
        this.insert('messages', {
          match_id: match.id,
          sender_id: other,
          kind: 'text',
          body: DEMO_REPLIES[this.replyIndex++ % DEMO_REPLIES.length],
        });
      }, 1800);
    } else if (msg.kind === 'snap') {
      setTimeout(() => {
        msg.viewed_at = new Date().toISOString();
        this.notify('messages', 'UPDATE', msg);
      }, 4000);
    }
  }

  // After onboarding, give the demo user some likes and matches that fit their preferences.
  seedFor(me: Row) {
    const myAge = ageFrom(me.birthdate);
    const fits = (p: DemoPerson) =>
      me.interested_in.includes(p.gender) &&
      p.interested_in.includes(me.gender as Gender) &&
      ageFrom(p.birthdate) >= me.age_min &&
      ageFrom(p.birthdate) <= me.age_max &&
      myAge >= 18;
    // People who fit both ways first, then anyone of a gender they want to see.
    const fitting = DEMO_PEOPLE.filter(fits);
    const extra = DEMO_PEOPLE.filter((p) => !fitting.includes(p) && me.interested_in.includes(p.gender));
    let pool = [...fitting, ...extra];
    if (pool.length < 5) pool = DEMO_PEOPLE;

    const matched = pool.slice(-2);
    const likers = pool.slice(1, -2).slice(0, 3);

    for (const p of likers) {
      this.tables.swipes.push({ swiper_id: p.id, target_id: ME, liked: true, created_at: minutesAgo(30) });
    }
    matched.forEach((p, i) => {
      this.tables.swipes.push({ swiper_id: ME, target_id: p.id, liked: true, created_at: minutesAgo(200) });
      this.tables.swipes.push({ swiper_id: p.id, target_id: ME, liked: true, created_at: minutesAgo(190) });
      const match = { id: `m-${p.id}`, user_a: ME, user_b: p.id, created_at: minutesAgo(180 - i * 60) };
      this.tables.matches.push(match);
      if (i === 0) {
        this.tables.messages.push(
          {
            id: uid(),
            match_id: match.id,
            sender_id: p.id,
            kind: 'text',
            body: 'Hey! Saw you’re nearby 👋',
            media_path: null,
            viewed_at: null,
            expires_at: null,
            created_at: minutesAgo(40),
          },
          {
            id: uid(),
            match_id: match.id,
            sender_id: ME,
            kind: 'text',
            body: 'Hi! How’s your day going?',
            media_path: null,
            viewed_at: null,
            expires_at: null,
            created_at: minutesAgo(35),
          },
          {
            id: uid(),
            match_id: match.id,
            sender_id: p.id,
            kind: 'snap',
            body: null,
            media_path: 'demo-snap/1',
            viewed_at: null,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            created_at: minutesAgo(5),
          },
        );
      }
    });
  }

  // ---- RPCs ----

  rpc(name: string, args: Row = {}): Result {
    const me = this.profile(ME);
    switch (name) {
      case 'update_location':
        return ok(null);

      case 'nearby_profiles': {
        if (!me) return fail('profile required');
        const max = this.hasPlus() ? 100 : 5;
        const radius = Math.min(Math.max(args.radius_mi ?? 5, 1), max);
        const myAge = ageFrom(me.birthdate);
        const rows = DEMO_PEOPLE.filter((p) => {
          const age = ageFrom(p.birthdate);
          return (
            p.distance_mi <= radius &&
            me.interested_in.includes(p.gender) &&
            p.interested_in.includes(me.gender) &&
            age >= me.age_min &&
            age <= me.age_max &&
            !this.isBlocked(ME, p.id) &&
            !this.tables.swipes.some((s) => s.swiper_id === ME && s.target_id === p.id) &&
            myAge >= 18
          );
        })
          .sort(
            (a, b) =>
              Number(b.boosted) - Number(a.boosted) ||
              Number(b.active) - Number(a.active) ||
              a.distance_mi - b.distance_mi,
          )
          .map((p) => {
            const row = this.profile(p.id)!;
            return {
              id: p.id,
              display_name: p.display_name,
              age: ageFrom(p.birthdate),
              bio: p.bio,
              looking_for: p.looking_for,
              photos: row.photos,
              verified: p.verified,
              distance_mi: p.distance_mi,
              active_now: p.active,
              boosted: p.boosted,
            };
          });
        return ok(rows);
      }

      case 'get_public_profile': {
        const p = this.profile(args.target);
        if (!p || this.isBlocked(ME, p.id)) return ok([]);
        return ok([
          {
            id: p.id,
            display_name: p.display_name,
            age: ageFrom(p.birthdate),
            gender: p.gender,
            bio: p.bio,
            looking_for: p.looking_for,
            photos: p.photos,
            verified: p.verified,
            matched: !!this.matchBetween(ME, p.id),
          },
        ]);
      }

      case 'swipe': {
        const { target, liked } = args as { target: string; liked: boolean };
        if (this.isBlocked(ME, target)) return ok(null);
        this.tables.swipes = this.tables.swipes.filter((s) => !(s.swiper_id === ME && s.target_id === target));
        this.tables.swipes.push({ swiper_id: ME, target_id: target, liked, created_at: new Date().toISOString() });
        if (!liked) return ok(null);
        const theyLiked = this.tables.swipes.some((s) => s.swiper_id === target && s.target_id === ME && s.liked);
        const person = this.person(target);
        if (theyLiked || person?.likesBack) {
          let match = this.matchBetween(ME, target);
          if (!match) {
            match = { id: `m-${target}`, user_a: ME, user_b: target, created_at: new Date().toISOString() };
            this.tables.matches.push(match);
            this.notify('matches', 'INSERT', match);
          }
          return ok(match.id);
        }
        return ok(null);
      }

      case 'likes_received_count':
        return ok(this.pendingLikers().length);

      case 'likes_received':
        if (!this.hasPlus()) return fail('LushDate+ required');
        return ok(
          this.pendingLikers().map((p) => ({
            id: p.id,
            display_name: p.display_name,
            age: ageFrom(p.birthdate),
            photos: p.photos,
            verified: p.verified,
          })),
        );

      case 'my_matches':
        return ok(
          this.tables.matches
            .filter((m) => !this.isBlocked(m.user_a, m.user_b))
            .map((m) => {
              const other = this.profile(this.otherIn(m))!;
              const last = this.tables.messages
                .filter((x) => x.match_id === m.id)
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .at(-1);
              return {
                match_id: m.id,
                other_id: other.id,
                display_name: other.display_name,
                photo: other.photos[0] ?? null,
                verified: other.verified,
                last_kind: last?.kind ?? null,
                last_body: last?.body ?? null,
                last_sender_id: last?.sender_id ?? null,
                last_at: last?.created_at ?? null,
                matched_at: m.created_at,
              };
            })
            .sort((a, b) => (b.last_at ?? b.matched_at).localeCompare(a.last_at ?? a.matched_at)),
        );

      case 'open_snap': {
        const msg = this.tables.messages.find((x) => x.id === args.message_id);
        if (!msg || msg.kind !== 'snap') return fail('snap not found');
        if (msg.sender_id === ME) return fail('you cannot open your own snap');
        if (msg.viewed_at || !msg.media_path) return fail('this snap has disappeared');
        msg.viewed_at = new Date().toISOString();
        this.notify('messages', 'UPDATE', msg);
        return ok(msg.media_path);
      }

      case 'block_user': {
        this.tables.blocks.push({ blocker_id: ME, blocked_id: args.target, created_at: new Date().toISOString() });
        const match = this.matchBetween(ME, args.target);
        if (match) {
          this.tables.matches = this.tables.matches.filter((m) => m !== match);
          this.tables.messages = this.tables.messages.filter((x) => x.match_id !== match.id);
        }
        return ok(null);
      }

      case 'unblock_user':
        this.tables.blocks = this.tables.blocks.filter((b) => !(b.blocker_id === ME && b.blocked_id === args.target));
        return ok(null);

      case 'my_blocks':
        return ok(
          this.tables.blocks
            .filter((b) => b.blocker_id === ME)
            .map((b) => {
              const p = this.profile(b.blocked_id)!;
              return { id: p.id, display_name: p.display_name, photo: p.photos[0] ?? null, blocked_at: b.created_at };
            }),
        );

      case 'start_call': {
        if (!this.hasPlus()) return fail('LushDate+ required');
        const match = this.tables.matches.find((m) => m.id === args.p_match_id);
        if (!match) return fail('match not found');
        if (this.tables.calls.some((c) => c.match_id === match.id && ['ringing', 'accepted'].includes(c.status))) {
          return fail('a call is already in progress');
        }
        const call: Row = {
          id: uid(),
          match_id: match.id,
          caller_id: ME,
          callee_id: this.otherIn(match),
          status: 'ringing',
          created_at: new Date().toISOString(),
          answered_at: null,
          ended_at: null,
        };
        this.tables.calls.push(call);
        this.notify('calls', 'INSERT', call);
        // The pretend person picks up after a few rings.
        setTimeout(() => {
          if (call.status !== 'ringing') return;
          Object.assign(call, { status: 'accepted', answered_at: new Date().toISOString() });
          this.notify('calls', 'UPDATE', call);
        }, 3500);
        return ok(call.id);
      }

      case 'answer_call': {
        const call = this.tables.calls.find((c) => c.id === args.p_call_id && c.callee_id === ME);
        if (!call) return fail('call not found');
        if (call.status !== 'ringing') return ok(call.status);
        Object.assign(
          call,
          args.accept ? { status: 'accepted', answered_at: new Date().toISOString() } : { status: 'declined' },
        );
        this.notify('calls', 'UPDATE', call);
        return ok(call.status);
      }

      case 'end_call': {
        const call = this.tables.calls.find((c) => c.id === args.p_call_id);
        if (call && ['ringing', 'accepted'].includes(call.status)) {
          Object.assign(call, {
            status: call.status === 'ringing' ? 'missed' : 'ended',
            ended_at: new Date().toISOString(),
          });
          this.notify('calls', 'UPDATE', call);
        }
        return ok(null);
      }

      case 'grant_boost': {
        const start = new Date();
        this.tables.boosts.push({
          id: uid(),
          user_id: ME,
          transaction_id: uid(),
          starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + (args.p_minutes ?? 30) * 60_000).toISOString(),
        });
        return ok(null);
      }

      case 'my_account_state':
        return ok({
          status: 'active',
          reason: null,
          verification_tier: me?.verification_tier ?? 0,
          kyc_status: me?.kyc_status ?? 'none',
          appeal_open: false,
        });

      case 'register_device':
      case 'submit_appeal':
        return ok(null);

      case 'my_credit_balance':
        return ok(0);

      case 'propose_date': {
        if ((me?.verification_tier ?? 0) < 2) return fail('Verify your ID to use date deposits.');
        const match = this.tables.matches.find((m) => m.id === args.p_match_id);
        if (!match) return fail('match not found');
        if (
          this.tables.date_plans.some(
            (d) => d.match_id === match.id && ['proposed', 'accepted', 'confirmed'].includes(d.status),
          )
        ) {
          return fail('There’s already a date planned in this chat.');
        }
        const plan: Row = {
          id: uid(),
          match_id: match.id,
          proposer_id: ME,
          invitee_id: this.otherIn(match),
          place_name: args.p_place_name,
          // Demo dates start in 10 minutes so check-in can be tried right away.
          starts_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          deposit_cents: args.p_deposit_cents,
          status: 'proposed',
          outcome_detail: null,
          created_at: new Date().toISOString(),
        };
        this.tables.date_plans.push(plan);
        this.notify('date_plans', 'INSERT', plan);
        setTimeout(() => this.updatePlan(plan, { status: 'accepted' }), 2000);
        return ok(plan.id);
      }

      case 'respond_date': {
        const plan = this.tables.date_plans.find((d) => d.id === args.p_plan_id);
        if (!plan) return fail('This date can’t be answered any more.');
        this.updatePlan(plan, { status: args.p_accept ? 'accepted' : 'declined' });
        return ok(plan.status);
      }

      case 'cancel_date':
      case 'dispute_date': {
        const plan = this.tables.date_plans.find((d) => d.id === args.p_plan_id);
        if (plan) this.updatePlan(plan, { status: name === 'cancel_date' ? 'cancelled' : 'disputed' });
        return ok(null);
      }

      default:
        return fail(`Demo: ${name} is not available`);
    }
  }

  updatePlan(plan: Row, patch: Row) {
    Object.assign(plan, patch);
    this.notify('date_plans', 'UPDATE', plan);
  }

  setDeposit(plan: Row, user: string, patch: Row) {
    let dep = this.tables.date_deposits.find((d) => d.plan_id === plan.id && d.user_id === user);
    if (!dep) {
      dep = {
        id: uid(),
        plan_id: plan.id,
        user_id: user,
        amount_cents: plan.deposit_cents,
        status: 'pending',
        checked_in_at: null,
      };
      this.tables.date_deposits.push(dep);
    }
    Object.assign(dep, patch);
    this.notify('date_deposits', 'UPDATE', dep);
  }

  // Demo deposit: no card; the pretend person places theirs a moment later.
  placeDeposit(planId: string) {
    const plan = this.tables.date_plans.find((d) => d.id === planId);
    if (!plan || !['accepted', 'confirmed'].includes(plan.status)) return fail('This date isn’t ready for deposits.');
    this.setDeposit(plan, ME, { status: 'authorized' });
    setTimeout(() => {
      this.setDeposit(plan, plan.proposer_id === ME ? plan.invitee_id : plan.proposer_id, { status: 'authorized' });
      this.updatePlan(plan, { status: 'confirmed' });
    }, 1500);
    return ok({ clientSecret: 'demo' });
  }

  checkIn(planId: string) {
    const plan = this.tables.date_plans.find((d) => d.id === planId);
    if (!plan || plan.status !== 'confirmed') return ok({ ok: false, reason: 'not_confirmed' });
    this.setDeposit(plan, ME, { checked_in_at: new Date().toISOString() });
    setTimeout(() => {
      const other = plan.proposer_id === ME ? plan.invitee_id : plan.proposer_id;
      this.setDeposit(plan, other, { checked_in_at: new Date().toISOString() });
      for (const d of this.tables.date_deposits.filter((x) => x.plan_id === plan.id)) d.status = 'released';
      this.updatePlan(plan, { status: 'completed' });
    }, 2500);
    return ok({ ok: true, distance_m: 12 });
  }

  pendingLikers(): Row[] {
    return this.tables.swipes
      .filter(
        (s) =>
          s.target_id === ME &&
          s.liked &&
          !this.isBlocked(ME, s.swiper_id) &&
          !this.tables.swipes.some((m) => m.swiper_id === ME && m.target_id === s.swiper_id),
      )
      .map((s) => this.profile(s.swiper_id)!)
      .filter(Boolean);
  }

  imageFor(path: string): string {
    const stored = this.files.get(path);
    if (stored) return stored;
    if (path.startsWith('demo-snap/')) return snapScene();
    if (path.startsWith('demo-placeholder/')) {
      const [, initial, n] = path.split('/');
      return placeholderPhoto(decodeURIComponent(initial), Number(n));
    }
    const [, owner, n] = path.split('/');
    const person = this.person(owner);
    return person ? portrait(person.look, Number(n)) : snapScene();
  }
}

/** A chainable, awaitable query over one demo table. */
class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy?: { col: string; asc: boolean };
  private max?: number;
  private singleMode?: 'single' | 'maybe';
  private returning = false;

  constructor(
    private db: DemoDb,
    private table: string,
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete',
    private payload?: Row,
  ) {}

  select() {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push((r) => r[col] > (value as string));
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: opts.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.run()), 120)).then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Result {
    let out = rows.map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max !== undefined) out = out.slice(0, this.max);
    if (this.singleMode) {
      if (out.length === 0) return this.singleMode === 'maybe' ? ok(null) : fail('No rows found');
      return ok(out[0]);
    }
    return ok(out);
  }

  private run(): Result {
    const rows = this.db.tables[this.table];
    if (!rows) return fail(`Demo: unknown table ${this.table}`);
    switch (this.op) {
      case 'select':
        return this.shape(this.matching());
      case 'insert': {
        const res = this.db.insert(this.table, this.payload!);
        if (res.error || !this.returning) return { data: null, error: res.error };
        return this.singleMode ? ok({ ...res.data }) : ok([{ ...res.data }]);
      }
      case 'upsert': {
        const key = PRIMARY_KEYS[this.table] ?? 'id';
        const existing = rows.find((r) => r[key] === this.payload![key]);
        if (existing) Object.assign(existing, this.payload);
        else rows.push({ ...this.payload });
        return ok(null);
      }
      case 'update': {
        const hit = this.matching();
        for (const r of hit) {
          Object.assign(r, this.payload);
          if (this.table === 'messages') this.db.notify('messages', 'UPDATE', r);
        }
        return this.returning ? this.shape(hit) : ok(null);
      }
      case 'delete': {
        const hit = new Set(this.matching());
        this.db.tables[this.table] = rows.filter((r) => !hit.has(r));
        return ok(null);
      }
    }
  }
}

export function createDemoClient(): SupabaseClient {
  const db = new DemoDb();
  let session: Row | null = null;
  const authListeners = new Set<(event: string, session: Row | null) => void>();
  const emit = (event: string) => authListeners.forEach((cb) => cb(event, session));
  const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 250));

  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange(cb: (event: string, session: Row | null) => void) {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
      signInWithOtp: () => later({ data: {}, error: null }),
      verifyOtp: ({ phone, token }: { phone: string; token: string }) => {
        if (token !== DEMO_CODE) return later(fail(`In the demo, the code is always ${DEMO_CODE}.`));
        session = {
          access_token: 'demo',
          token_type: 'bearer',
          user: {
            id: ME,
            phone,
            aud: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        };
        emit('SIGNED_IN');
        return later(ok({ session }));
      },
      signOut: async () => {
        session = null;
        emit('SIGNED_OUT');
        return { error: null };
      },
      startAutoRefresh: () => undefined,
      stopAutoRefresh: () => undefined,
    },

    from(table: string) {
      return {
        select: () => new Query(db, table, 'select'),
        insert: (payload: Row) => new Query(db, table, 'insert', payload),
        update: (payload: Row) => new Query(db, table, 'update', payload),
        upsert: (payload: Row) => new Query(db, table, 'upsert', payload),
        delete: () => new Query(db, table, 'delete'),
      };
    },

    rpc: (name: string, args?: Row) => later(db.rpc(name, args)),

    storage: {
      from: () => ({
        upload: async (path: string, body: ArrayBuffer, opts?: { contentType?: string }) => {
          const blob = new Blob([body], { type: opts?.contentType ?? 'image/jpeg' });
          db.files.set(path, URL.createObjectURL(blob));
          return ok({ path });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: db.imageFor(path) } }),
        createSignedUrl: async (path: string) => ok({ signedUrl: db.imageFor(path) }),
        remove: async () => ok([]),
        list: async () => ok([]),
      }),
    },

    channel() {
      const channel = {
        handlers: [] as Handler[],
        on(_type: string, f: { event: string; table: string; filter?: string }, cb: Handler['cb']) {
          channel.handlers.push({ table: f.table, event: f.event, filter: f.filter, cb });
          return channel;
        },
        subscribe() {
          db.channels.add(channel);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: async (channel: { handlers: Handler[] }) => {
      db.channels.delete(channel);
      return 'ok';
    },

    functions: {
      invoke: async (name: string, opts?: { body?: Row }) => {
        if (name === 'delete-account') db.reset();
        // The demo can't analyse photos; the real check runs on the server.
        if (name === 'check-photo') return ok({ ok: true, checked: false });
        if (name === 'call-token') return ok({ token: 'demo', url: 'demo' });
        if (name === 'report-location') return ok({ verdict: 'ok', reasons: [] });
        if (name === 'panic') return ok({ notified: false, reason: 'no_contact' });
        if (name === 'date-deposit') return db.placeDeposit(opts?.body?.planId);
        if (name === 'date-check-in') return db.checkIn(opts?.body?.planId);
        if (name === 'kyc-start') {
          // Simulated ID + liveness check that passes after a moment.
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const me = db.profile(ME);
          if (me) Object.assign(me, { kyc_status: 'approved', verification_tier: 2, verified: true });
          return ok({ status: 'approved' });
        }
        return ok({ deleted: true });
      },
    },
  };

  return client as unknown as SupabaseClient;
}
