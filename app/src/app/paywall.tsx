import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCheckout } from '@/components/Checkout';
import { Button, Muted, Screen } from '@/components/ui';
import { useUserId } from '@/lib/auth';
import { formatMoney, getPrices, intervalLabel, manageSubscription, type Prices } from '@/lib/payments';
import { hasPlus, usePlus, waitForServer } from '@/lib/purchases';
import { errorMessage } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'videocam',
    title: 'Video calls',
    body: 'Video call your matches before you meet. Answering is free for everyone.',
  },
  { icon: 'heart', title: 'See who likes you', body: 'Match instantly with people already into you.' },
  { icon: 'navigate', title: 'Unlimited radius', body: 'Browse up to 100 miles — the whole city and beyond.' },
  { icon: 'eye-off', title: 'Incognito mode', body: 'Only people you like can see you in Nearby.' },
];

export default function Paywall() {
  const t = useTheme();
  const userId = useUserId();
  const { isPlus, refresh } = usePlus(userId);
  const { pay, prompt } = useCheckout();
  const [prices, setPrices] = useState<Prices | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPrices()
      .then(setPrices)
      .catch(() => setPrices({ available: false }));
  }, []);

  const plan = prices?.plus;

  async function buy() {
    setBusy(true);
    try {
      const result = await pay('payments', { action: 'plus' });
      if (!result.ok) {
        if (!result.cancelled) showAlert('Payment not completed', result.message);
        return;
      }
      await waitForServer(() => hasPlus(userId), 4);
      await refresh();
      showAlert('Welcome to LushDate+ 💎', 'Your new features are switched on.');
      router.back();
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    try {
      await manageSubscription();
    } catch (e) {
      showAlert('Couldn’t open your subscription', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      {prompt}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 56 }}>💎</Text>
          <Text style={[styles.title, { color: t.text }]}>LushDate+</Text>
          <Muted center>More people, more matches, more privacy.</Muted>
        </View>

        {PERKS.map((perk) => (
          <View key={perk.title} style={styles.perk}>
            <View style={[styles.perkIcon, { backgroundColor: t.surfaceRaised }]}>
              <Ionicons name={perk.icon} size={20} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{perk.title}</Text>
              <Muted>{perk.body}</Muted>
            </View>
          </View>
        ))}

        {isPlus ? (
          <Text style={[styles.active, { color: t.success }]}>✓ LushDate+ is active on your account</Text>
        ) : prices === null ? (
          <ActivityIndicator color={t.primary} />
        ) : !plan ? (
          <Muted center>LushDate+ isn’t on sale yet. Please check back soon.</Muted>
        ) : (
          <View style={[styles.plan, { borderColor: t.primary, backgroundColor: t.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{plan.name}</Text>
              <Muted>Renews every {intervalLabel(plan.interval)}. Cancel anytime.</Muted>
            </View>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>
              {formatMoney(plan.amount)}/{intervalLabel(plan.interval)}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isPlus ? (
          <Button title="Manage subscription" variant="secondary" onPress={manage} loading={busy} />
        ) : plan ? (
          <>
            <Button title="Pay with Paystack" onPress={buy} loading={busy} />
            <Text style={[styles.legal, { color: t.muted }]}>
              Paid securely by card through Paystack. Renews automatically until you cancel in Me → LushDate+ → Manage
              subscription.
            </Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg },
  hero: { alignItems: 'center', gap: space.sm },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  perk: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  perkIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: space.md,
  },
  active: { textAlign: 'center', fontWeight: '700', fontSize: 16 },
  footer: { paddingHorizontal: space.lg, gap: space.xs },
  legal: { fontSize: 11, textAlign: 'center' },
});
