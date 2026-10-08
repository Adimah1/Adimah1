import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { photoUrl } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

/** A photo tile for the Nearby and Likes grids. */
export function ProfileTile({
  name,
  age,
  photo,
  verified,
  subtitle,
  activeNow,
  boosted,
  blurred,
  onPress,
}: {
  name: string;
  age: number;
  photo: string | undefined;
  verified: boolean;
  subtitle?: string;
  activeNow?: boolean;
  boosted?: boolean;
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
        accessibilityLabel={blurred ? 'Hidden profile' : `${name}, ${age}${subtitle ? `, ${subtitle}` : ''}`}
        style={({ pressed }) => [styles.tile, { backgroundColor: t.surface, opacity: pressed ? 0.85 : 1 }]}
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
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.shade} />

        <View style={styles.badges}>
          {boosted ? (
            <View style={[styles.pill, { backgroundColor: t.accent }]}>
              <Ionicons name="flash" size={12} color="#2A0A1F" />
            </View>
          ) : null}
          {activeNow ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
              <View style={[styles.online, { backgroundColor: t.success }]} />
              <Text style={styles.pillText}>Now</Text>
            </View>
          ) : null}
        </View>

        {blurred ? null : (
          <View style={styles.caption}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {name}, {age}
              </Text>
              {verified ? <Ionicons name="checkmark-circle" size={16} color="#6CC4FF" /> : null}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { width: '50%', padding: space.xs },
  tile: { aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  badges: { position: 'absolute', top: space.sm, left: space.sm, right: space.sm, flexDirection: 'row', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  online: { width: 7, height: 7, borderRadius: 4 },
  caption: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1 },
  subtitle: { color: '#F2DCE6', fontSize: 12, fontWeight: '600' },
});
