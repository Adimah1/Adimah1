import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Purchases from 'react-native-purchases';

import { Glass } from '@/components/Glass';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { PillButton, ProfileHero } from '@/components/ProfileHero';
import { Button } from '@/components/ui';
import { useAuth, useUserId } from '@/lib/auth';
import { IS_DEMO } from '@/lib/env';
import { ageFrom } from '@/lib/format';
import {
  BOOST_OFFERING,
  isCancelled,
  purchasesAvailable,
  resetPurchases,
  usePlus,
  waitForServer,
} from '@/lib/purchases';
import { unregisterPush } from '@/lib/push';
import { errorMessage, supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import { LOOKING_FOR_LABELS } from '@/lib/types';
import { showAlert } from '@/lib/alert';

export default function Me() {
  const t = useTheme();
  const userId = useUserId();
  const { profile, refreshProfile, signOut } = useAuth();
  const { isPlus, refresh: refreshPlus } = usePlus(userId);
  const [boostMinutesLeft, setBoostMinutesLeft] = useState<number | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [counts, setCounts] = useState({ likes: 0, matches: 0 });

  const loadBoost = useCallback(async () => {
    const { data } = await supabase
      .from('boosts')
      .select('ends_at')
      .eq('user_id', userId)
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const minutes = data?.ends_at
      ? Math.max(1, Math.round((new Date(data.ends_at).getTime() - Date.now()) / 60000))
      : null;
    setBoostMinutesLeft(minutes);
    return minutes !== null;
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refreshPlus();
      loadBoost();
      Promise.all([supabase.rpc('likes_received_count'), supabase.rpc('my_matches')]).then(([likes, matches]) =>
        setCounts({
          likes: (likes.data as number | null) ?? 0,
          matches: ((matches.data as unknown[] | null) ?? []).length,
        }),
      );
    }, [refreshPlus, loadBoost]),
  );

  if (!profile) return null;

  async function setFlag(field: 'is_paused' | 'incognito', value: boolean) {
    if (field === 'incognito' && value && !isPlus) {
      router.push('/paywall');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId);
    if (error) showAlert('Could not update', errorMessage(error));
    refreshProfile();
  }

  async function boost() {
    if (IS_DEMO) {
      setBoosting(true);
      await supabase.rpc('grant_boost', { p_user: userId, p_transaction_id: 'demo', p_minutes: 30 });
      await loadBoost();
      setBoosting(false);
      showAlert('Boost active ⚡', 'You’re at the top of Nearby for 30 minutes. (Demo: no charge.)');
      return;
    }
    if (!purchasesAvailable) {
      showAlert('Boosts unavailable', 'Purchases aren’t available in this build.');
      return;
    }
    setBoosting(true);
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.all[BOOST_OFFERING]?.availablePackages[0];
      if (!pkg) {
        showAlert('Boosts unavailable', 'Please try again later.');
        return;
      }
      await Purchases.purchasePackage(pkg);
      await waitForServer(loadBoost);
    } catch (e) {
      if (!isCancelled(e)) showAlert('Boost failed', errorMessage(e));
    } finally {
      setBoosting(false);
    }
  }

  async function doSignOut() {
    await unregisterPush();
    await resetPurchases();
    await signOut();
  }

  function deleteAccount() {
    showAlert(
      'Delete your account?',
      'Your profile, matches and messages will be permanently deleted. This can’t be undone. Cancel any subscription in your app store settings first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            await unregisterPush();
            const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
            if (error) {
              showAlert('Could not delete account', errorMessage(error));
              return;
            }
            await resetPurchases();
            await signOut();
          },
        },
      ],
    );
  }

  const handle = `@${profile.display_name.toLowerCase().replace(/\s+/g, '')}`;

  return (
    <ProfileHero
      photos={profile.photos}
      name={profile.display_name}
      subtitle={`${handle} · ${ageFrom(profile.birthdate)} · ${isPlus ? '💎 LushDate+' : 'Free plan'}`}
      verified={profile.verified}
      bio={profile.bio}
      title={handle}
      stats={[
        { value: String(counts.likes), label: 'Likes' },
        { value: String(counts.matches), label: 'Matches' },
        { value: String(profile.photos.length), label: 'Photos' },
      ]}
      tags={[
        `#${LOOKING_FOR_LABELS[profile.looking_for].toLowerCase().replace(/\s+/g, '')}`,
        ...(profile.verified ? ['#verified'] : []),
      ]}
      right={<PillButton label="Edit Profile" onPress={() => router.push('/edit-profile')} />}
      bottomSpace={TAB_BAR_SPACE}
    >
      {!profile.verified ? (
        <Pressable onPress={() => router.push('/verify')}>
          <Glass style={styles.cardRow}>
            <Ionicons name="shield-checkmark" size={26} color="#6CC4FF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Get verified</Text>
              <Text style={styles.cardBody}>Take a quick selfie to earn the check mark.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.muted} />
          </Glass>
        </Pressable>
      ) : null}

      {!isPlus ? (
        <Pressable onPress={() => router.push('/paywall')}>
          <Glass style={[styles.cardRow, { borderColor: t.primary }]}>
            <Text style={{ fontSize: 26 }}>💎</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Get LushDate+</Text>
              <Text style={styles.cardBody}>Video calls, see who likes you, browse the whole city, go incognito.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.muted} />
          </Glass>
        </Pressable>
      ) : null}

      <Glass style={styles.cardRow}>
        <Text style={{ fontSize: 26 }}>⚡</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {boostMinutesLeft !== null ? `Boost active · ${boostMinutesLeft} min left` : 'Boost'}
          </Text>
          <Text style={styles.cardBody}>Be first in everyone’s Nearby feed for 30 minutes.</Text>
        </View>
        {boostMinutesLeft === null ? <Button title="Boost" onPress={boost} loading={boosting} /> : null}
      </Glass>

      <Glass style={styles.card}>
        <Toggle
          label="Pause my profile"
          hint="Hide from Nearby. Existing matches can still message you."
          value={profile.is_paused}
          onChange={(v) => setFlag('is_paused', v)}
        />
        <View style={[styles.divider, { backgroundColor: t.glassBorder }]} />
        <Toggle
          label="Incognito"
          hint={isPlus ? 'Only people you like can see you.' : 'LushDate+ feature.'}
          value={profile.incognito && isPlus}
          onChange={(v) => setFlag('incognito', v)}
        />
      </Glass>

      <Glass>
        <Row icon="shield-checkmark" label="Safety & blocked users" onPress={() => router.push('/safety')} />
      </Glass>

      <Button title="Sign out" variant="secondary" onPress={doSignOut} />
      <Button title="Delete account" variant="ghost" onPress={deleteAccount} />
    </ProfileHero>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{label}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.border }} />
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={20} color={t.primary} />
      <Text style={{ color: t.text, fontSize: 16, flex: 1, fontWeight: '600' }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={t.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.md, gap: space.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cardBody: { color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
});
