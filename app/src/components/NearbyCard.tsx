import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { distanceLabel } from '@/lib/format';
import { photoUrl } from '@/lib/supabase';
import { fonts, useTheme } from '@/lib/theme';
import type { NearbyProfile } from '@/lib/types';

import { Avatar } from './Avatar';
import { Glass } from './Glass';

/** Big photo card for the Nearby carousel, styled like a live-stream tile. */
export function NearbyCard({
  person,
  width,
  onPress,
  onLike,
}: {
  person: NearbyProfile;
  width: number;
  onPress: () => void;
  onLike: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${person.display_name}, ${person.age}, ${distanceLabel(person.distance_mi)}`}
      style={({ pressed }) => [
        styles.card,
        { width, height: width * 1.42, opacity: pressed ? 0.92 : 1, backgroundColor: t.surface },
      ]}
    >
      {person.photos[0] ? (
        <Image
          source={{ uri: photoUrl(person.photos[0]) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Glass radius={20} style={styles.chip}>
        <View style={styles.chipInner}>
          <Avatar path={person.photos[1] ?? person.photos[0] ?? null} size={30} shape="square" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.chipName} numberOfLines={1}>
              {person.display_name}
            </Text>
            <Text style={styles.chipSub} numberOfLines={1}>
              {distanceLabel(person.distance_mi).toUpperCase()}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Like ${person.display_name}`}
            onPress={onLike}
            hitSlop={8}
            style={({ pressed }) => [styles.likePill, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.likeText, { color: t.accent }]}>Like</Text>
          </Pressable>
        </View>
      </Glass>

      <View style={styles.bottom}>
        <Text style={styles.title} numberOfLines={2}>
          {person.display_name}, {person.age}
        </Text>
        <View style={styles.meta}>
          {person.active_now ? (
            <View style={[styles.badge, { backgroundColor: t.live }]}>
              <Text style={styles.badgeText}>NOW</Text>
            </View>
          ) : null}
          {person.boosted ? <Ionicons name="flash" size={14} color={t.accent} /> : null}
          {person.verified ? <Ionicons name="checkmark-circle" size={15} color="#6CC4FF" /> : null}
          <Text style={styles.metaText}>• {person.distance_mi <= 1 ? '<1' : person.distance_mi} mi</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, overflow: 'hidden' },
  chip: { position: 'absolute', top: 12, left: 12, right: 12 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 7 },
  chipName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chipSub: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontWeight: '600', letterSpacing: 0.4 },
  likePill: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  likeText: { fontSize: 12, fontWeight: '700' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8 },
  title: { color: '#fff', fontFamily: fonts.display, fontSize: 36, lineHeight: 40, textTransform: 'uppercase' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
});
