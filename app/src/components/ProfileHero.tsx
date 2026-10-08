import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { photoUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

import { Glass } from './Glass';

export interface Stat {
  value: string;
  label: string;
}

/**
 * Full-bleed photo with a frosted card on top: big name, a short line, bio,
 * stats, tags and a strip of photos that swaps the background.
 */
export function ProfileHero({
  photos,
  name,
  subtitle,
  verified,
  bio,
  stats,
  tags,
  title,
  left,
  right,
  children,
  footer,
  bottomSpace = 0,
}: {
  photos: string[];
  name: string;
  subtitle?: string;
  verified?: boolean;
  bio?: string;
  stats: Stat[];
  tags: string[];
  /** Small text in the centre of the top bar. */
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Extra content under the card (settings, etc.). */
  children?: ReactNode;
  /** Pinned to the bottom of the screen (actions). */
  footer?: ReactNode;
  bottomSpace?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const current = photos[index] ?? photos[0];

  const step = (delta: number) => setIndex((i) => (photos.length ? (i + delta + photos.length) % photos.length : 0));

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {current ? (
        <Image
          source={{ uri: photoUrl(current) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.05)', 'rgba(11,10,12,0.9)', t.background]}
        locations={[0, 0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={{ paddingTop: height * 0.3, paddingBottom: bottomSpace + insets.bottom + 24 }}>
        <Glass radius={32} intensity={50} style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.handle} />
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit>
                {name}
              </Text>
              {verified ? (
                <LinearGradient colors={t.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.verified}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </LinearGradient>
              ) : null}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {bio ? <Text style={styles.bio}>{bio}</Text> : null}

            <View style={styles.stats}>
              {stats.map((s) => (
                <View key={s.label} style={{ flex: 1 }}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {tags.length > 0 ? (
              <View style={styles.tags}>
                {tags.map((tag) => (
                  <View key={tag} style={[styles.tag, { borderColor: t.glassBorder }]}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {photos.length > 1 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  {photos.map((p, i) => (
                    <Pressable key={p} accessibilityLabel={`Photo ${i + 1}`} onPress={() => setIndex(i)}>
                      <Image
                        source={{ uri: photoUrl(p) }}
                        style={[
                          styles.thumb,
                          i === index ? { borderColor: t.text, borderWidth: 2 } : { opacity: 0.75 },
                        ]}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.arrows}>
                  <Pressable accessibilityLabel="Previous photo" onPress={() => step(-1)} style={styles.arrow}>
                    <Ionicons name="arrow-back" size={18} color="#111" />
                  </Pressable>
                  <Pressable accessibilityLabel="Next photo" onPress={() => step(1)} style={styles.arrow}>
                    <Ionicons name="arrow-forward" size={18} color="#111" />
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </Glass>
        {children ? <View style={styles.children}>{children}</View> : null}
      </ScrollView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.side}>{left}</View>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
      </View>

      {footer ? (
        <LinearGradient
          colors={['transparent', 'rgba(11,10,12,0.85)', t.background]}
          locations={[0, 0.45, 1]}
          style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
        >
          {footer}
        </LinearGradient>
      ) : null}
    </View>
  );
}

/** Round frosted icon button for the top bar. */
export function GlassIconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} hitSlop={8}>
      <Glass radius={22} style={styles.iconButton}>
        <Ionicons name={icon} size={20} color="#fff" />
      </Glass>
    </Pressable>
  );
}

/** Solid black pill for the top bar, e.g. "Edit Profile". */
export function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12 },
  cardInner: { padding: 22, gap: 14 },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  name: { flex: 1, color: '#fff', fontSize: 52, lineHeight: 56, fontWeight: '500', letterSpacing: -1.6 },
  verified: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: -6 },
  bio: { color: '#fff', fontSize: 16, lineHeight: 23 },
  stats: { flexDirection: 'row', marginTop: 4 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tagText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  strip: { gap: 10, paddingVertical: 2 },
  thumb: { width: 96, height: 116, borderRadius: 18 },
  arrows: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  children: { paddingHorizontal: 12, paddingTop: 16, gap: 12 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  side: { flex: 1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pill: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
