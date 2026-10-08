import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { photoUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/** A tall photo tile for two-column grids (More nearby, Likes). */
export function ProfileTile({
  name,
  age,
  photo,
  verified,
  badge,
  activeNow,
  blurred,
  onPress,
}: {
  name: string;
  age: number;
  photo: string | undefined;
  verified: boolean;
  /** Short pill text in the top corner, e.g. "2 mi". */
  badge?: string;
  activeNow?: boolean;
  blurred?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.cell}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={blurred ? 'Hidden profile' : `${name}, ${age}`}
        style={({ pressed }) => [styles.tile, { backgroundColor: t.surface, opacity: pressed ? 0.88 : 1 }]}
      >
        {photo ? (
          <Image
            source={{ uri: photoUrl(photo) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={blurred ? 40 : 0}
            transition={150}
          />
        ) : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.shade} />

        {badge && !blurred ? (
          <View style={[styles.badge, { backgroundColor: t.info }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}

        {blurred ? (
          <View style={styles.lock}>
            <Ionicons name="lock-closed" size={22} color="#fff" />
          </View>
        ) : (
          <View style={styles.caption}>
            {activeNow ? <View style={[styles.online, { backgroundColor: t.success }]} /> : null}
            <Text style={styles.name} numberOfLines={1}>
              {name}, {age}
            </Text>
            {verified ? <Ionicons name="checkmark-circle" size={15} color="#6CC4FF" /> : null}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: '50%', padding: 6 },
  tile: { aspectRatio: 3 / 4.2, borderRadius: 24, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  badge: { position: 'absolute', top: 10, left: 10, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  caption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  online: { width: 8, height: 8, borderRadius: 4 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  lock: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
