import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Loading, Screen } from '@/components/ui';
import { openSafetyMenu } from '@/lib/safety';
import { errorMessage, photoUrl, supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { LOOKING_FOR_LABELS, type PublicProfile } from '@/lib/types';

export default function ProfileScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .rpc('get_public_profile', { target: id })
      .then(({ data }) => setProfile(((data ?? []) as PublicProfile[])[0] ?? null));
  }, [id]);

  async function swipe(liked: boolean) {
    if (!profile) return;
    setBusy(true);
    const { data: matchId, error } = await supabase.rpc('swipe', { target: profile.id, liked });
    setBusy(false);
    if (error) {
      Alert.alert('Something went wrong', errorMessage(error));
      return;
    }
    if (liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (matchId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert('It’s a match! 💘', `You and ${profile.display_name} like each other.`, [
        { text: 'Keep browsing', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Say hi',
          onPress: () => router.replace({ pathname: '/chat/[matchId]', params: { matchId: matchId as string } }),
        },
      ]);
      return;
    }
    router.back();
  }

  async function openChat() {
    const { data } = await supabase.rpc('my_matches');
    const match = ((data ?? []) as { match_id: string; other_id: string }[]).find((m) => m.other_id === id);
    if (match) router.push({ pathname: '/chat/[matchId]', params: { matchId: match.match_id } });
  }

  if (profile === undefined) return <Loading />;
  if (profile === null) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          emoji="👻"
          title="Profile unavailable"
          body="This person may have paused or deleted their profile."
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel="Report or block"
              hitSlop={12}
              onPress={() => openSafetyMenu(profile.id, profile.display_name, () => router.back())}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={t.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {profile.photos.map((p) => (
            <Image key={p} source={{ uri: photoUrl(p) }} style={{ width, height: width * 1.25 }} contentFit="cover" />
          ))}
        </ScrollView>
        {profile.photos.length > 1 ? (
          <View style={styles.dots}>
            {profile.photos.map((p, i) => (
              <View key={p} style={[styles.dot, { backgroundColor: i === photoIndex ? t.primary : t.border }]} />
            ))}
          </View>
        ) : null}

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: t.text }]}>
              {profile.display_name}, {profile.age}
            </Text>
            {profile.verified ? <Ionicons name="checkmark-circle" size={24} color="#6CC4FF" /> : null}
          </View>
          <View style={[styles.tag, { backgroundColor: t.surfaceRaised }]}>
            <Ionicons name="sparkles" size={14} color={t.accent} />
            <Text style={{ color: t.text, fontWeight: '600' }}>{LOOKING_FOR_LABELS[profile.looking_for]}</Text>
          </View>
          {profile.bio ? <Text style={[styles.bio, { color: t.text }]}>{profile.bio}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.md }]}>
        {profile.matched ? (
          <Button title={`Message ${profile.display_name}`} onPress={openChat} style={{ flex: 1 }} />
        ) : (
          <>
            <Pressable
              accessibilityLabel="Pass"
              disabled={busy}
              onPress={() => swipe(false)}
              style={[styles.round, { backgroundColor: t.surface, borderColor: t.border }]}
            >
              <Ionicons name="close" size={34} color={t.muted} />
            </Pressable>
            <Pressable
              accessibilityLabel="Like"
              disabled={busy}
              onPress={() => swipe(true)}
              style={[styles.round, styles.like, { backgroundColor: t.primary, borderColor: t.primary }]}
            >
              <Ionicons name="heart" size={38} color="#fff" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  info: { padding: space.lg, gap: space.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  tag: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bio: { fontSize: 17, lineHeight: 25 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  round: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  like: { width: 80, height: 80, borderRadius: 40 },
});
