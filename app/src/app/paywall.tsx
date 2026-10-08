import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { Button, Muted, Screen } from '@/components/ui';
import { useUserId } from '@/lib/auth';
import { hasPlus, isCancelled, purchasesAvailable, usePlus, waitForServer } from '@/lib/purchases';
import { errorMessage } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'heart', title: 'See who likes you', body: 'Match instantly with people already into you.' },
  { icon: 'navigate', title: 'Unlimited radius', body: 'Browse up to 100 miles — the whole city and beyond.' },
  { icon: 'eye-off', title: 'Incognito mode', body: 'Only people you like can see you in Nearby.' },
];

export default function Paywall() {
  const t = useTheme();
  const userId = useUserId();
  const { isPlus } = usePlus(userId);
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!purchasesAvailable) return;
    Purchases.getOfferings()
      .then((offerings) => {
        const list = offerings.current?.availablePackages ?? [];
        setPackages(list);
        setSelected(list[0] ?? null);
      })
      .catch(() => setPackages([]));
  }, []);

  const serverHasPlus = () => hasPlus(userId);

  async function buy() {
    if (!selected) return;
    setBusy(true);
    try {
      await Purchases.purchasePackage(selected);
      const ok = await waitForServer(serverHasPlus);
      if (!ok) {
        Alert.alert('Almost there', 'Your purchase went through. It can take a minute for LushDate+ to switch on.');
      }
      router.back();
    } catch (e) {
      if (!isCancelled(e)) Alert.alert('Purchase failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await Purchases.restorePurchases();
      const ok = await waitForServer(serverHasPlus, 4);
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'LushDate+ is active.' : 'No active subscription was found.',
      );
      if (ok) router.back();
    } catch (e) {
      Alert.alert('Restore failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
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
        ) : !purchasesAvailable ? (
          <Muted center>
            Purchases aren’t available in this build. Use a development or store build with RevenueCat configured.
          </Muted>
        ) : packages === null ? (
          <ActivityIndicator color={t.primary} />
        ) : packages.length === 0 ? (
          <Muted center>No plans are available right now. Please try again later.</Muted>
        ) : (
          <View style={{ gap: space.sm }}>
            {packages.map((pkg) => {
              const active = selected?.identifier === pkg.identifier;
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setSelected(pkg)}
                  style={[styles.plan, { borderColor: active ? t.primary : t.border, backgroundColor: t.surface }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{pkg.product.title}</Text>
                    <Muted>{pkg.product.description}</Muted>
                  </View>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{pkg.product.priceString}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {!isPlus && purchasesAvailable ? (
        <View style={styles.footer}>
          <Button title="Continue" onPress={buy} loading={busy} disabled={!selected} />
          <Button title="Restore purchases" variant="ghost" onPress={restore} disabled={busy} />
          <Text style={[styles.legal, { color: t.muted }]}>
            Subscriptions renew automatically until cancelled in your App Store or Google Play settings.
          </Text>
        </View>
      ) : null}
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
