import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProfileTile } from '@/components/ProfileTile';
import { Button, Chip, EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { distanceLabel } from '@/lib/format';
import { useLocationSync } from '@/lib/location';
import { usePlus } from '@/lib/purchases';
import { errorMessage, supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import type { NearbyProfile } from '@/lib/types';

const FREE_RADIUS = 5;
const RADII = [
  { miles: 1, label: '1 mi' },
  { miles: 5, label: '5 mi' },
  { miles: 10, label: '10 mi' },
  { miles: 25, label: '25 mi' },
  { miles: 100, label: 'City+' },
];

export default function Nearby() {
  const t = useTheme();
  const { profile, session } = useAuth();
  const { isPlus, refresh: refreshPlus } = usePlus(session?.user.id);
  const { status, sync } = useLocationSync(false);
  const [radius, setRadius] = useState(FREE_RADIUS);
  const [people, setPeople] = useState<NearbyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (miles: number) => {
      setLoading(true);
      setError(null);
      await sync().catch(() => false);
      const { data, error: rpcError } = await supabase.rpc('nearby_profiles', { radius_mi: miles });
      setLoading(false);
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

  let empty;
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
  } else if (!loading) {
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
      <View style={styles.header}>
        <Text style={[styles.heading, { color: t.text }]}>Nearby</Text>
        <Text style={{ color: t.muted }}>{people.filter((p) => p.active_now).length} active now</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.radii}
        style={{ flexGrow: 0 }}
      >
        {RADII.map((r) => (
          <Chip key={r.miles} label={r.label} selected={radius === r.miles} onPress={() => pickRadius(r.miles)} />
        ))}
      </ScrollView>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={[styles.grid, people.length === 0 && { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(radius)} tintColor={t.primary} />}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <ProfileTile
            name={item.display_name}
            age={item.age}
            photo={item.photos[0]}
            verified={item.verified}
            subtitle={distanceLabel(item.distance_mi)}
            activeNow={item.active_now}
            boosted={item.boosted}
            onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  heading: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  radii: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md },
  grid: { paddingHorizontal: space.xs, paddingBottom: space.lg },
});
