import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '@/lib/theme';

import { LOGO_ASPECT, LOGO_URI } from './logoImage';

/** The LushDate mark: the cherry logo and the serif wordmark. */
export function Wordmark({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <CherryLogo height={Math.round(size * 1.35)} />
      <Text style={{ color: t.text, fontFamily: fonts.serif, fontSize: size * 1.1 }}>LushDate</Text>
    </View>
  );
}

/** The cherry logo. */
export function CherryLogo({ height }: { height: number }) {
  return (
    <Image
      source={{ uri: LOGO_URI }}
      style={{ height, width: height * LOGO_ASPECT }}
      contentFit="contain"
      accessibilityLabel="LushDate"
    />
  );
}

/** Two-tone section label: a white lead and a muted tail, e.g. "Active" "now". */
export function SectionLabel({ lead, tail }: { lead: string; tail: string }) {
  const t = useTheme();
  return (
    <Text style={styles.label}>
      <Text style={{ color: t.text }}>{lead} </Text>
      <Text style={{ color: t.muted }}>{tail}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
});

/** Page title in the serif display face, with an optional muted line under it. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
      <Text style={{ color: t.text, fontFamily: fonts.serif, fontSize: 44, lineHeight: 50 }}>{title}</Text>
      {subtitle ? <Text style={{ color: t.muted, fontSize: 14 }}>{subtitle}</Text> : null}
    </View>
  );
}
