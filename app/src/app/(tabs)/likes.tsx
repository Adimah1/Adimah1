import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ProfileTile } from '@/components/ProfileTile';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useUserId } from '@/lib/auth';
import { usePlus } from '@/lib/purchases';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import type { LikeCard } from '@/lib/types';

export default function Likes() {
  const t = useTheme();
  const userId = useUserId();
  const { isPlus, refresh: refreshPlus } = usePlus(userId);
  const [count, setCount] = useState(0);
  const [likes, setLikes] = useState<LikeCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await refreshPlus();
    const { data: n } = await supabase.rpc('likes_received_count');
    setCount((n as number | null) ?? 0);
    const { data, error } = await supabase.rpc('likes_received');
    // Free users get a "LushDate+ required" error here; they see the teaser instead.
    setLikes(error ? [] : ((data ?? []) as LikeCard[]));
    setLoading(false);
  }, [refreshPlus]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const teaser = Array.from({ length: Math.min(count, 6) }, (_, i) => ({ id: `hidden-${i}` }));

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: t.text }]}>Likes</Text>
        <Text style={{ color: t.muted }}>{count === 1 ? '1 person likes you' : `${count} people like you`}</Text>
      </View>

      {isPlus ? (
        <FlatList
          data={likes}
          keyExtractor={(l) => l.id}
          numColumns={2}
          contentContainerStyle={[styles.grid, likes.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />}
          ListEmptyComponent={
            loading ? null : (
              <EmptyState emoji="💌" title="No new likes yet" body="When someone likes you, they’ll show up here." />
            )
          }
          renderItem={({ item }) => (
            <ProfileTile
              name={item.display_name}
              age={item.age}
              photo={item.photos[0]}
              verified={item.verified}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })}
            />
          )}
        />
      ) : count === 0 ? (
        <EmptyState
          emoji="💌"
          title="No likes yet"
          body="Add great photos and keep your location on — people nearby will find you."
        />
      ) : (
        <FlatList
          data={teaser}
          keyExtractor={(l) => l.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />}
          ListHeaderComponent={
            <View style={styles.upsell}>
              <Text style={[styles.upsellTitle, { color: t.text }]}>See who likes you</Text>
              <Text style={{ color: t.muted, textAlign: 'center' }}>
                Match instantly with anyone who’s already into you.
              </Text>
              <Button title="Unlock with LushDate+" onPress={() => router.push('/paywall')} />
            </View>
          }
          renderItem={() => <ProfileTile name="" age={0} photo={undefined} verified={false} blurred />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: 2 },
  heading: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  grid: { paddingHorizontal: space.xs, paddingBottom: space.lg },
  upsell: { gap: space.md, padding: space.md, alignItems: 'stretch' },
  upsellTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
});
