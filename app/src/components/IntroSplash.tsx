import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/lib/theme';

import { CherryLogo } from './Brand';

const native = Platform.OS !== 'web';

/** A soft red halo made of stacked translucent circles (no blur needed). */
export function Halo({ size, color = '#FF1744' }: { size: number; color?: string }) {
  const rings = 9;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: rings }, (_, i) => {
        const d = size * (1 - i / rings);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: 0.07,
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * The welcome moment shown every time LushDate opens: the cherry pops in on a
 * red glow, the name rises in, then the whole thing fades into the app.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  const logo = useState(() => new Animated.Value(0))[0];
  const glow = useState(() => new Animated.Value(0))[0];
  const words = useState(() => new Animated.Value(0))[0];
  const line = useState(() => new Animated.Value(0))[0];
  const fade = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: native,
        }),
        Animated.timing(glow, {
          toValue: 0.55,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: native,
        }),
      ]),
    );
    pulse.start();
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: native }),
      Animated.timing(words, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.timing(line, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: native }),
    ]).start(() => {
      pulse.stop();
      onDone();
    });
    return () => pulse.stop();
  }, [logo, glow, words, line, fade, onDone]);

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      accessibilityLabel="Welcome to LushDate"
    >
      <LinearGradient colors={['#2A0A10', '#0B0A0C', '#0B0A0C']} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glow,
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] }) }],
            },
          ]}
        >
          <Halo size={360} />
        </Animated.View>
        <Animated.View
          style={{
            opacity: logo,
            transform: [
              { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
            ],
          }}
        >
          <CherryLogo height={150} />
        </Animated.View>
        <Animated.Text style={[styles.name, rise(words)]}>LushDate</Animated.Text>
        <Animated.View style={rise(line)}>
          <Text style={styles.line}>Welcome. Someone nearby is waiting.</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, elevation: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  glow: { position: 'absolute', top: '50%', marginTop: -250 },
  name: { color: '#fff', fontFamily: fonts.serif, fontSize: 64, lineHeight: 72, marginTop: 8 },
  line: { color: '#E8B9C4', fontSize: 16, letterSpacing: 0.2 },
});
