import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

/** Frosted-glass panel: blurred backdrop, faint white fill and a hairline edge. */
export function Glass({
  children,
  style,
  radius = 24,
  intensity = 40,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        { borderRadius: radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder },
        style,
      ]}
    >
      <BlurView tint="dark" intensity={intensity} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass }]} />
      {children}
    </View>
  );
}
