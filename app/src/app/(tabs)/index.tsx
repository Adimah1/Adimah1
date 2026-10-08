import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { SectionLabel, Wordmark } from '@/components/Brand';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { NearbyCard } from '@/components/NearbyCard';
import { ProfileTile } from '@/components/ProfileTile';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { lastLocationVerdict, useLocationSync } from '@/lib/location';
import { usePlus } from '@/lib/purchases';
import { errorMessage, supabase } from '@/lib/supabase';
import { locationProblem } from '@/lib/security';
import { swipeOn } from '@/lib/swipe';
import { space, useTheme } from '@/lib/theme';
import type { NearbyProfile } from '@/lib/types';

const FREE_RADIUS = 5;
const FEATURED = 6;
const RADII = [
  { miles: 1, label: '1 mi' },
  { miles: 5, label: '5 mi' },
  { miles: 10, label: '10 mi' },
  { miles: 25, label: '25 mi' },
  { miles: 100, label: 'City+' },
];

export default function Nearby() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { profile, session } = useAuth();
  const { isPlus, refresh: refreshPlus } = usePlus(session?.user.id);
  const { status, sync } = useLocationSync(false);
  const [radius, setRadius] = useState(FREE_RADIUS);
  const [people, setPeople] = useState<NearbyProfile[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const load = useCallback(
    async (miles: number) => {
      setLoading(true);
      setError(null);
      await sync().catch(() => false);
      setLocationNote(locationProblem(lastLocationVerdict()));
      const [{ data, error: rpcError }, { data: likes }] = await Promise.all([
        supabase.rpc('nearby_profiles', { radius_mi: miles }),
        supabase.rpc('likes_received_count'),
      ]);
      setLoading(false);
      setLikeCount((likes as number | null) ?? 0);
      if (rpcError) {
        setError(errorMessage(rpcError));
        return;
      }
      setPeople((data ?? []) as NearbyProfile[]);
    },
    [sync],
  );

  useFocusEffect(
    useCallback(() => {
      refreshPlus();
      load(radius);
    }, [load, radius, refreshPlus]),
  );

  function pickRadius(miles: number) {
    if (miles > FREE_RADIUS && !isPlus) {
      router.push('/paywall');
      return;
    }
    setRadius(miles);
  }

  const open = (id: string) => {
    const dist = people.find((p) => p.id === id)?.distance_mi;
    router.push({ pathname: '/profile/[id]', params: dist === undefined ? { id } : { id, dist: String(dist) } });
  };
  const like = (p: NearbyProfile) =>
    swipeOn(p, true, () => undefined).then((ok) => {
      if (ok) setPeople((cur) => cur.filter((x) => x.id !== p.id));
    });

  const active = people.filter((p) => p.active_now);
  const featured = people.slice(0, FEATURED);
  const rest = people.slice(FEATURED);
  const cardWidth = Math.min(width * 0.68, 300);

  let empty = null;
  if (status === 'denied') {
    empty = (
      <EmptyState
        emoji="📍"
        title="Location is off"
        body="LushDate needs your approximate location to show people nearby."
        action={<Button title="Open Settings" onPress={() => Linking.openSettings()} />}
      />
    );
  } else if (profile?.is_paused) {
    empty = (
      <EmptyState
        emoji="⏸️"
        title="Your profile is paused"
        body="You’re hidden from everyone. Unpause from the Me tab to see who’s around."
        action={<Button title="Go to Me" onPress={() => router.navigate('/me')} />}
      />
    );
  } else if (error) {
    empty = (
      <EmptyState
        emoji="😕"
        title="Couldn’t load nearby"
        body={error}
        action={<Button title="Try again" onPress={() => load(radius)} />}
      />
    );
  } else if (!loading && people.length === 0) {
    empty = (
      <EmptyState
        emoji="🌙"
        title="No one new nearby"
        body={
          isPlus
            ? 'Try a bigger radius, or check back later.'
            : 'Check back soon — or unlock a bigger radius with LushDate+.'
        }
      />
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(radius)} tintColor={t.primary} />}
      >
        <View style={styles.header}>
          <Wordmark />
          <View style={styles.headerRight}>
            <Pressable
              accessibilityLabel={`Likes, ${likeCount} new`}
              hitSlop={10}
              onPress={() => router.navigate('/likes')}
            >
              <Ionicons name="notifications-outline" size={26} color={t.text} />
              {likeCount > 0 ? (
                <View style={[styles.bellDot, { backgroundColor: t.primary, borderColor: t.background }]} />
              ) : null}
            </Pressable>
            <Pressable accessibilityLabel="My profile" onPress={() => router.navigate('/me')}>
              <Avatar path={profile?.photos[0] ?? null} size={46} shape="square" />
            </Pressable>
          </View>
        </View>

        {locationNote ? (
          <View style={[styles.note, { borderColor: t.accent }]}>
            <Ionicons name="warning" size={18} color={t.accent} />
            <Text style={{ color: t.text, flex: 1, fontSize: 13, lineHeight: 18 }}>{locationNote}</Text>
          </View>
        ) : null}

        {empty ? (
          <View style={{ flex: 1 }}>{empty}</View>
        ) : (
          <>
            {active.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <SectionLabel lead="Active" tail="now" />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {active.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityLabel={`${p.display_name}, active now`}
                      onPress={() => open(p.id)}
                    >
                      <Avatar path={p.photos[0] ?? null} size={60} shape="square" online />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <SectionLabel lead="Near" tail="you" />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radii}>
                {RADII.map((r) => {
                  const selected = radius === r.miles;
                  const locked = r.miles > FREE_RADIUS && !isPlus;
                  return (
                    <Pressable
                      key={r.miles}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => pickRadius(r.miles)}
                      style={[
                        styles.radius,
                        {
                          backgroundColor: selected ? t.text : t.glass,
                          borderColor: selected ? t.text : t.glassBorder,
                        },
                      ]}
                    >
                      {locked ? <Ionicons name="lock-closed" size={11} color={t.muted} /> : null}
                      <Text style={{ color: selected ? t.background : t.text, fontWeight: '700', fontSize: 13 }}>
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <FlatList
                horizontal
                data={featured}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + 14}
                decelerationRate="fast"
                contentContainerStyle={styles.rail}
                ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                renderItem={({ item }) => (
                  <NearbyCard person={item} width={cardWidth} onPress={() => open(item.id)} onLike={() => like(item)} />
                )}
              />
            </View>

            {rest.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <SectionLabel lead="More" tail="nearby" />
                </View>
                <View style={styles.grid}>
                  {rest.map((p) => (
                    <ProfileTile
                      key={p.id}
                      name={p.display_name}
                      age={p.age}
                      photo={p.photos[0]}
                      verified={p.verified}
                      activeNow={p.active_now}
                      badge={`${p.distance_mi <= 1 ? '<1' : p.distance_mi} mi`}
                      onPress={() => open(p.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,197,110,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  bellDot: { position: 'absolute', top: 1, right: 1, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  section: { marginTop: space.md, gap: 12 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  rail: { paddingHorizontal: space.lg, gap: 12 },
  radii: { paddingHorizontal: space.lg, gap: 8 },
  radius: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg - 6 },
});
