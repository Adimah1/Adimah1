import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glass } from '@/components/Glass';
import { Button, Chip, Field, Muted, Screen } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { useAuth, useUserId } from '@/lib/auth';
import { useCheckout } from '@/components/Checkout';
import { checkInMessage, checkInPosition, formatWhen, locatePlace, myCredit } from '@/lib/dates';
import { formatNaira as formatMoney } from '@/lib/payments';
import { errorMessage, supabase } from '@/lib/supabase';
import { fonts, space, useTheme } from '@/lib/theme';
import type { DateDeposit, DatePlan, MatchSummary } from '@/lib/types';

const OPEN: DatePlan['status'][] = ['proposed', 'accepted', 'confirmed'];
/** Deposit choices in kobo (₦2,000 – ₦20,000). */
const AMOUNTS = [200000, 300000, 500000, 1000000, 2000000];
const TIMES = [12, 15, 18, 19, 20, 21];

function dayOptions() {
  const out: { label: string; date: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      date: d,
    });
  }
  return out;
}

/** Plan a date with a show-up deposit, pay your deposit, and check in. */
export default function DateScreen() {
  const t = useTheme();
  const userId = useUserId();
  const { profile } = useAuth();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [plan, setPlan] = useState<DatePlan | null>(null);
  const [deposits, setDeposits] = useState<DateDeposit[]>([]);
  const [credit, setCredit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [place, setPlace] = useState('');
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(19);
  const [amount, setAmount] = useState(300000);
  const { pay, prompt } = useCheckout();

  const load = useCallback(
    () =>
      fetchDate(matchId).then((d) => {
        setMatch(d.match);
        setPlan(d.plan);
        setDeposits(d.deposits);
        setCredit(d.credit);
        setLoading(false);
      }),
    [matchId],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDate(matchId).then((d) => {
      if (!active) return;
      setMatch(d.match);
      setPlan(d.plan);
      setDeposits(d.deposits);
      setCredit(d.credit);
      setLoading(false);
    });
    const channel = supabase
      .channel(`date:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'date_plans', filter: `match_id=eq.${matchId}` },
        () => load(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_deposits' }, () => load())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [matchId, load]);

  function needsId(message: string) {
    showAlert('Verify your ID first', message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Verify my ID', onPress: () => router.push('/verify') },
    ]);
  }

  function handleError(title: string, error: unknown) {
    const message = errorMessage(error);
    if (/Verify your ID/i.test(message)) needsId(message);
    else showAlert(title, message);
  }

  async function propose() {
    if (!place.trim()) return;
    setBusy(true);
    try {
      const spot = await locatePlace(place.trim());
      if (!spot) {
        showAlert('Place not found', 'Try the venue’s full name and street, e.g. “Blue Bottle Coffee, 450 W 15th St”.');
        return;
      }
      const when = dayOptions()[day].date;
      when.setHours(hour, 0, 0, 0);
      const { error } = await supabase.rpc('propose_date', {
        p_match_id: matchId,
        p_place_name: place.trim(),
        p_lat: spot.lat,
        p_lng: spot.lng,
        p_starts_at: when.toISOString(),
        p_deposit_cents: amount,
      });
      if (error) handleError('Couldn’t plan the date', error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function respond(accept: boolean) {
    if (!plan) return;
    setBusy(true);
    const { error } = await supabase.rpc('respond_date', { p_plan_id: plan.id, p_accept: accept });
    setBusy(false);
    if (error) handleError('Something went wrong', error);
    load();
  }

  async function placeDeposit() {
    if (!plan) return;
    setBusy(true);
    try {
      const result = await pay('date-deposit', { planId: plan.id });
      if (!result.ok) {
        if (!result.cancelled) handleError('Deposit not placed', new Error(result.message));
        return;
      }
      showAlert(
        'Deposit placed',
        result.covered
          ? 'Your LushDate credit covered it.'
          : 'It’s refunded in full to your card or account when you both check in.',
      );
      load();
    } catch (e) {
      handleError('Deposit not placed', e);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!plan) return;
    setBusy(true);
    try {
      const pos = await checkInPosition();
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; reason?: string }>('date-check-in', {
        body: { planId: plan.id, ...pos },
      });
      if (error) throw error;
      showAlert(
        data?.ok ? 'You’re checked in ✓' : 'Not checked in',
        data?.ok ? 'Enjoy your date!' : checkInMessage(data?.reason),
      );
      load();
    } catch (e) {
      handleError('Not checked in', e);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!plan) return;
    const { error } = await supabase.rpc('cancel_date', { p_plan_id: plan.id });
    if (error) showAlert('Can’t cancel', errorMessage(error));
    load();
  }

  async function dispute() {
    if (!plan) return;
    const { error } = await supabase.rpc('dispute_date', { p_plan_id: plan.id, p_reason: 'Reported from the app' });
    showAlert(
      error ? 'Can’t report' : 'Thanks — we’ll review it',
      error ? errorMessage(error) : 'Our team will look at what happened and contact you.',
    );
    load();
  }

  if (loading) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  const name = match?.display_name ?? 'your match';
  const open = plan && OPEN.includes(plan.status) ? plan : null;
  const mine = deposits.find((d) => d.user_id === userId);
  const theirs = deposits.find((d) => d.user_id !== userId);
  const startsAt = plan ? new Date(plan.starts_at).getTime() : 0;
  const canCheckIn = open?.status === 'confirmed' && now > startsAt - 30 * 60_000 && now < startsAt + 90 * 60_000;
  const tier = profile?.verification_tier ?? 0;

  return (
    <Screen edges={['bottom']}>
      {prompt}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Plan a date with {name}</Text>
        <Glass style={styles.explainer}>
          <Ionicons name="shield-checkmark" size={22} color={t.success} />
          <Text style={styles.explainText}>
            <Text style={{ fontWeight: '800', color: '#fff' }}>Show-up deposits. </Text>
            You both pay the same deposit through Paystack. Check in at the place and both are refunded in full. If one
            of you doesn’t show, their deposit becomes LushDate credit for the other.
          </Text>
        </Glass>
        {credit > 0 ? (
          <Muted>You have {formatMoney(credit)} LushDate credit — it’s used for your next deposit.</Muted>
        ) : null}

        {open ? (
          <Glass style={styles.card}>
            <View style={styles.cardInner}>
              <Text style={styles.place}>{open.place_name}</Text>
              <Text style={styles.meta}>
                {formatWhen(open.starts_at)} · {formatMoney(open.deposit_cents)} deposit each
              </Text>
              <View style={styles.statusRow}>
                <Status label="You" deposit={mine} />
                <Status label={name} deposit={theirs} />
              </View>

              {open.status === 'proposed' && open.invitee_id === userId ? (
                <View style={styles.row}>
                  <Button title="Decline" variant="secondary" onPress={() => respond(false)} style={{ flex: 1 }} />
                  <Button title="Accept" onPress={() => respond(true)} loading={busy} style={{ flex: 1 }} />
                </View>
              ) : open.status === 'proposed' ? (
                <Muted>Waiting for {name} to accept.</Muted>
              ) : mine?.status !== 'authorized' ? (
                <Button
                  title={`Pay ${formatMoney(open.deposit_cents)} deposit`}
                  onPress={placeDeposit}
                  loading={busy}
                />
              ) : open.status === 'accepted' ? (
                <Muted>Your deposit is in. Waiting for {name}’s.</Muted>
              ) : (
                <Button
                  title={canCheckIn ? 'Check in at the place' : 'Check-in opens 30 min before'}
                  onPress={checkIn}
                  loading={busy}
                  disabled={!canCheckIn || !!mine?.checked_in_at}
                />
              )}
              <Button title="Cancel date" variant="ghost" onPress={cancel} />
            </View>
          </Glass>
        ) : (
          <>
            {plan ? (
              <Glass style={styles.card}>
                <View style={styles.cardInner}>
                  <Text style={styles.meta}>
                    Last date: {plan.place_name} · {formatWhen(plan.starts_at)}
                  </Text>
                  <Text style={styles.outcome}>{outcomeText(plan.status, name)}</Text>
                  {['completed', 'no_show'].includes(plan.status) ? (
                    <Button title="Report a problem" variant="ghost" onPress={dispute} />
                  ) : null}
                </View>
              </Glass>
            ) : null}

            {tier < 2 ? (
              <Glass style={styles.card}>
                <View style={styles.cardInner}>
                  <Text style={styles.place}>Verify your ID to use deposits</Text>
                  <Muted>
                    Deposits involve money, so both people must have verified their government ID with a live selfie. It
                    takes about 2 minutes.
                  </Muted>
                  <Button title="Verify my ID" onPress={() => router.push('/verify')} />
                </View>
              </Glass>
            ) : (
              <View style={{ gap: space.md }}>
                <Field
                  label="Where"
                  value={place}
                  onChangeText={setPlace}
                  placeholder="Blue Bottle Coffee, 450 W 15th St"
                />
                <Text style={styles.label}>When</Text>
                <View style={styles.chips}>
                  {dayOptions().map((d, i) => (
                    <Chip key={d.label} label={d.label} selected={day === i} onPress={() => setDay(i)} />
                  ))}
                </View>
                <View style={styles.chips}>
                  {TIMES.map((h) => (
                    <Chip
                      key={h}
                      label={`${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`}
                      selected={hour === h}
                      onPress={() => setHour(h)}
                    />
                  ))}
                </View>
                <Text style={styles.label}>Deposit each</Text>
                <View style={styles.chips}>
                  {AMOUNTS.map((a) => (
                    <Chip key={a} label={formatMoney(a)} selected={amount === a} onPress={() => setAmount(a)} />
                  ))}
                </View>
                <Muted>New accounts can use up to ₦5,000 for their first 30 days. Meet somewhere public.</Muted>
                <Button title="Propose date" onPress={propose} loading={busy} disabled={!place.trim()} />
              </View>
            )}
          </>
        )}
        <Button title="Back to chat" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

async function fetchDate(matchId: string) {
  const [{ data: matches }, { data: plans }, credit] = await Promise.all([
    supabase.rpc('my_matches'),
    supabase.from('date_plans').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(1),
    myCredit(),
  ]);
  const plan = ((plans ?? []) as DatePlan[])[0] ?? null;
  const { data: deps } = plan
    ? await supabase.from('date_deposits').select('*').eq('plan_id', plan.id)
    : { data: [] as DateDeposit[] };
  return {
    match: ((matches ?? []) as MatchSummary[]).find((m) => m.match_id === matchId) ?? null,
    plan,
    deposits: (deps ?? []) as DateDeposit[],
    credit,
  };
}

function outcomeText(status: DatePlan['status'], name: string): string {
  switch (status) {
    case 'completed':
      return 'You both showed up — deposits refunded. 🍒';
    case 'no_show':
      return 'Someone didn’t show. The no-show’s deposit was kept and credited to the person who came.';
    case 'expired':
      return 'This date expired. Any deposits were refunded.';
    case 'declined':
      return `${name} couldn’t make it. Nothing was charged.`;
    case 'cancelled':
      return 'This date was cancelled. Any deposits were refunded.';
    case 'disputed':
      return 'Our team is reviewing this date.';
    default:
      return '';
  }
}

function Status({ label, deposit }: { label: string; deposit: DateDeposit | undefined }) {
  const t = useTheme();
  const state = deposit?.checked_in_at
    ? { icon: 'location' as const, text: 'Checked in', color: t.success }
    : deposit?.status === 'authorized'
      ? { icon: 'checkmark-circle' as const, text: 'Deposit paid', color: t.success }
      : { icon: 'time-outline' as const, text: 'No deposit yet', color: t.muted };
  return (
    <View style={styles.status}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusValue}>
        <Ionicons name={state.icon} size={15} color={state.color} />
        <Text style={{ color: state.color, fontWeight: '700', fontSize: 13 }}>{state.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
  title: { color: '#fff', fontFamily: fonts.serif, fontSize: 36, lineHeight: 40 },
  explainer: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  explainText: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20 },
  card: {},
  cardInner: { padding: 18, gap: 12 },
  place: { color: '#fff', fontSize: 20, fontWeight: '800' },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  outcome: { color: '#fff', fontSize: 15, lineHeight: 21 },
  statusRow: { flexDirection: 'row', gap: 12 },
  status: { flex: 1, gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 10 },
  statusLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  statusValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
