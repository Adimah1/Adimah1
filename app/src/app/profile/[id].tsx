import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Glass } from '@/components/Glass';
import { GlassIconButton, ProfileHero } from '@/components/ProfileHero';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { openSafetyMenu } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { swipeOn } from '@/lib/swipe';
import { useTheme } from '@/lib/theme';
import { GENDER_SELF_LABELS, LOOKING_FOR_LABELS, type LookingFor, type PublicProfile } from '@/lib/types';

const LOOKING_SHORT: Record<LookingFor, string> = {
  relationship: 'Dating',
  casual: 'Casual',
  friends: 'Friends',
  not_sure: 'Open',
};

export default function ProfileScreen() {
  const t = useTheme();
  const { id, dist } = useLocalSearchParams<{ id: string; dist?: string }>();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .rpc('get_public_profile', { target: id })
      .then(({ data }) => setProfile(((data ?? []) as PublicProfile[])[0] ?? null));
  }, [id]);

  async function swipe(liked: boolean) {
    if (!profile) return;
    setBusy(true);
    await swipeOn(profile, liked, () => router.back(), true);
    setBusy(false);
  }

  async function openChat() {
    const { data } = await supabase.rpc('my_matches');
    const match = ((data ?? []) as { match_id: string; other_id: string }[]).find((m) => m.other_id === id);
    if (match) router.push({ pathname: '/chat/[matchId]', params: { matchId: match.match_id } });
  }

  if (profile === undefined) return <Loading />;
  if (profile === null) {
    return (
      <Screen>
        <EmptyState
          emoji="👻"
          title="Profile unavailable"
          body="This person may have paused or deleted their profile."
          action={<GlassIconButton icon="arrow-back" label="Back" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const miles = dist ? Number(dist) : null;
  const handle = `@${profile.display_name.toLowerCase().replace(/\s+/g, '')}`;

  return (
    <ProfileHero
      photos={profile.photos}
      name={profile.display_name}
      subtitle={`${handle} · ${LOOKING_FOR_LABELS[profile.looking_for]}`}
      verified={profile.verified}
      bio={profile.bio}
      title={handle}
      stats={[
        { value: String(profile.age), label: 'Age' },
        { value: miles === null ? '—' : miles <= 1 ? '<1 mi' : `${miles} mi`, label: 'Away' },
        { value: LOOKING_SHORT[profile.looking_for], label: 'Looking for' },
      ]}
      tags={[
        `#${GENDER_SELF_LABELS[profile.gender].toLowerCase()}`,
        `#${LOOKING_SHORT[profile.looking_for].toLowerCase()}`,
        ...(profile.verified ? ['#verified'] : []),
        ...(profile.matched ? ['#match'] : []),
      ]}
      left={<GlassIconButton icon="chevron-back" label="Back" onPress={() => router.back()} />}
      right={
        <GlassIconButton
          icon="ellipsis-horizontal"
          label="Report or block"
          onPress={() => openSafetyMenu(profile.id, profile.display_name, () => router.back())}
        />
      }
      bottomSpace={110}
      footer={
        profile.matched ? (
          <Pressable accessibilityRole="button" onPress={openChat} style={{ flex: 1 }}>
            <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.message}>
              <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
              <Text style={styles.messageText}>Message {profile.display_name}</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <>
            <Pressable accessibilityLabel="Pass" disabled={busy} onPress={() => swipe(false)}>
              <Glass radius={36} intensity={60} style={styles.round}>
                <Ionicons name="close" size={34} color="#fff" />
              </Glass>
            </Pressable>
            <Pressable accessibilityLabel="Like" disabled={busy} onPress={() => swipe(true)}>
              <LinearGradient
                colors={t.glow}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.round, styles.like]}
              >
                <Ionicons name="heart" size={38} color="#fff" />
              </LinearGradient>
            </Pressable>
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  like: {
    width: 84,
    height: 84,
    borderRadius: 42,
    shadowColor: '#FF4F8B',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    paddingVertical: 17,
  },
  messageText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
