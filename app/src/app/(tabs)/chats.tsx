import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PageTitle, SectionLabel } from '@/components/Brand';
import { TAB_BAR_SPACE } from '@/components/GlassTabBar';
import { EmptyState, Screen } from '@/components/ui';
import { useUserId } from '@/lib/auth';
import { matchPreview, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import type { MatchSummary } from '@/lib/types';

export default function Chats() {
  const t = useTheme();
  const userId = useUserId();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_matches');
    setMatches((data ?? []) as MatchSummary[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Refresh the list whenever a message or match involving us arrives.
  useEffect(() => {
    const channel = supabase
      .channel('chats-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const fresh = matches.filter((m) => !m.last_kind);
  const conversations = matches.filter((m) => m.last_kind);

  return (
    <Screen edges={['top']}>
      <PageTitle title="Chats" />
      <FlatList
        data={conversations}
        keyExtractor={(m) => m.match_id}
        contentContainerStyle={[{ paddingBottom: TAB_BAR_SPACE }, matches.length === 0 && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />}
        ListHeaderComponent={
          fresh.length > 0 ? (
            <View>
              <View style={styles.sectionWrap}>
                <SectionLabel lead="New" tail="matches" />
              </View>
              <FlatList
                horizontal
                data={fresh}
                keyExtractor={(m) => m.match_id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.md, paddingHorizontal: space.md }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => openChat(item.match_id)} style={styles.fresh}>
                    <Avatar path={item.photo} size={68} shape="square" online />
                    <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                  </Pressable>
                )}
              />
              {conversations.length > 0 ? (
                <View style={styles.sectionWrap}>
                  <SectionLabel lead="Your" tail="messages" />
                </View>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading || fresh.length > 0 ? null : (
            <EmptyState
              emoji="💬"
              title="No chats yet"
              body="When you and someone nearby like each other, you can chat here."
            />
          )
        }
        renderItem={({ item }) => {
          const unreadSnap = item.last_kind === 'snap' && item.last_sender_id !== userId;
          return (
            <Pressable
              onPress={() => openChat(item.match_id)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surface : 'transparent' }]}
            >
              <Avatar path={item.photo} size={56} shape="square" />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                    {item.display_name}{' '}
                    {item.verified ? <Ionicons name="checkmark-circle" size={14} color="#6CC4FF" /> : null}
                  </Text>
                  {item.last_at ? <Text style={{ color: t.muted, fontSize: 12 }}>{timeAgo(item.last_at)}</Text> : null}
                </View>
                <Text
                  style={{ color: unreadSnap ? t.primary : t.muted, fontWeight: unreadSnap ? '700' : '400' }}
                  numberOfLines={1}
                >
                  {matchPreview(item, userId)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

function openChat(matchId: string) {
  router.push({ pathname: '/chat/[matchId]', params: { matchId } });
}

const styles = StyleSheet.create({
  sectionWrap: { paddingHorizontal: space.md, paddingVertical: space.md },
  heading: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8, paddingHorizontal: space.md, paddingTop: space.sm },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, padding: space.md },
  fresh: { width: 76, alignItems: 'center', gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  name: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
});
