import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { ILLUSTRATED_PEOPLE, portrait } from '@/lib/illustrations';
import { fonts } from '@/lib/theme';

import { Glass } from './Glass';
import { Halo } from './IntroSplash';

const native = Platform.OS !== 'web';

/** Gentle up-and-down drift for floating elements. */
function useFloat(delay = 0, distance = 8) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });
}

const FAN = [
  { person: ILLUSTRATED_PEOPLE[2], rotate: '-12deg', x: -96, y: 18, chip: '2 mi' },
  { person: ILLUSTRATED_PEOPLE[1], rotate: '10deg', x: 96, y: 26, chip: '<1 mi' },
  { person: ILLUSTRATED_PEOPLE[0], rotate: '0deg', x: 0, y: 0, chip: 'NOW' },
];

/** Slide 1: a fanned stack of profile cards with a floating like. */
export function PhotoFan({ scale = 1 }: { scale?: number }) {
  const floats = [useFloat(0), useFloat(400), useFloat(800)];
  const heart = useFloat(200, 12);
  const w = 150 * scale;
  return (
    <View style={styles.stage}>
      <View style={styles.halo}>
        <Halo size={340 * scale} />
      </View>
      {FAN.map((c, i) => (
        <Animated.View
          key={c.person.name}
          style={[
            styles.fanCard,
            {
              width: w,
              height: w * 1.38,
              transform: [
                { translateX: c.x * scale },
                { translateY: Animated.add(floats[i], c.y * scale) },
                { rotate: c.rotate },
              ],
              zIndex: i,
            },
          ]}
        >
          <Image source={{ uri: portrait(c.person.look) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.fanShade} />
          <Text style={[styles.fanName, { fontSize: 22 * scale }]}>{c.person.name.toUpperCase()}</Text>
          <View style={[styles.fanChip, c.chip === 'NOW' ? { backgroundColor: '#FF5A1F' } : null]}>
            <Text style={styles.fanChipText}>{c.chip}</Text>
          </View>
        </Animated.View>
      ))}
      <Animated.View style={[styles.heart, { transform: [{ translateY: heart }] }]}>
        <LinearGradient colors={['#FF6B81', '#FF1744', '#A3001E']} style={styles.heartInner}>
          <Ionicons name="heart" size={28} color="#fff" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/** Slide 2: a chat with a vanishing snap and a video call. */
export function ChatPreview() {
  const a = useFloat(0, 6);
  const b = useFloat(500, 6);
  return (
    <View style={styles.stage}>
      <View style={styles.halo}>
        <Halo size={320} />
      </View>
      <Glass radius={28} intensity={50} style={styles.chatCard}>
        <View style={styles.chatInner}>
          <View style={styles.chatHead}>
            <Image
              source={{ uri: portrait(ILLUSTRATED_PEOPLE[0].look) }}
              style={styles.chatAvatar}
              contentFit="cover"
            />
            <Text style={styles.chatName}>Maya</Text>
            <View style={styles.online} />
            <View style={{ flex: 1 }} />
            <Ionicons name="videocam" size={20} color="#FF2E4D" />
          </View>
          <View style={[styles.bubble, styles.theirs]}>
            <Text style={styles.bubbleText}>Hey! Saw you’re nearby 👋</Text>
          </View>
          <View style={[styles.bubble, styles.mine]}>
            <Text style={styles.bubbleText}>Coffee at 5? ☕</Text>
          </View>
          <View style={styles.snap}>
            <Ionicons name="square" size={14} color="#FF2E4D" />
            <Text style={styles.snapText}>Tap to view snap</Text>
            <Text style={styles.snapTimer}>10s</Text>
          </View>
        </View>
      </Glass>
      <Animated.View style={[styles.pill, { top: 18, right: 6, transform: [{ translateY: a }] }]}>
        <Glass radius={999} style={styles.pillInner}>
          <Ionicons name="eye-off" size={14} color="#fff" />
          <Text style={styles.pillText}>Vanishes after 1 view</Text>
        </Glass>
      </Animated.View>
      <Animated.View style={[styles.pill, { bottom: 36, left: 0, transform: [{ translateY: b }] }]}>
        <Glass radius={999} style={styles.pillInner}>
          <Ionicons name="videocam" size={14} color="#FFC56E" />
          <Text style={styles.pillText}>Video call before you meet</Text>
        </Glass>
      </Animated.View>
    </View>
  );
}

const SAFETY: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'checkmark-circle', title: 'Verified with a selfie', body: 'Real photos of real people' },
  { icon: 'location', title: 'Location blurred', body: 'Only a rounded distance is shown' },
  { icon: 'shield-checkmark', title: 'Block & report', body: 'One tap, from any chat' },
];

/** Slide 3: safety promises. */
export function SafetyPreview() {
  const floats = [useFloat(0, 6), useFloat(300, 6), useFloat(600, 6)];
  return (
    <View style={styles.stage}>
      <View style={styles.halo}>
        <Halo size={320} />
      </View>
      <View style={{ gap: 12, width: 280 }}>
        {SAFETY.map((s, i) => (
          <Animated.View key={s.title} style={{ transform: [{ translateY: floats[i] }, { translateX: (i - 1) * 14 }] }}>
            <Glass radius={22} intensity={50} style={styles.safetyRow}>
              <LinearGradient colors={['#FF6B81', '#FF1744', '#A3001E']} style={styles.safetyIcon}>
                <Ionicons name={s.icon} size={20} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyTitle}>{s.title}</Text>
                <Text style={styles.safetyBody}>{s.body}</Text>
              </View>
            </Glass>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  fanCard: {
    position: 'absolute',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fanShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  fanName: { position: 'absolute', left: 12, bottom: 12, color: '#fff', fontFamily: fonts.display },
  fanChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#2F8CFF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  fanChipText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  heart: { position: 'absolute', right: '18%', bottom: '14%', zIndex: 10 },
  heartInner: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  chatCard: { width: 280 },
  chatInner: { padding: 16, gap: 10 },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  chatAvatar: { width: 34, height: 34, borderRadius: 11 },
  chatName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  online: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3DDC84' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  theirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderBottomLeftRadius: 6 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#FF2E4D', borderBottomRightRadius: 6 },
  bubbleText: { color: '#fff', fontSize: 14 },
  snap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#FF2E4D',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  snapText: { color: '#FF2E4D', fontWeight: '700', fontSize: 14 },
  snapTimer: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  pill: { position: 'absolute' },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  safetyIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  safetyTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  safetyBody: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
});
