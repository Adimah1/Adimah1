import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '@/lib/theme';

/** The LushDate mark: a glowing gradient diamond with a heart, and the serif wordmark. */
export function Wordmark({ size = 26 }: { size?: number }) {
  const t = useTheme();
  const mark = Math.round(size * 1.15);
  return (
    <View style={styles.row}>
      <LinearGradient
        colors={t.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: mark,
          height: mark,
          borderRadius: mark * 0.32,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '45deg' }],
        }}
      >
        <Ionicons name="heart" size={mark * 0.55} color="#fff" style={{ transform: [{ rotate: '-45deg' }] }} />
      </LinearGradient>
      <Text style={{ color: t.text, fontFamily: fonts.serif, fontSize: size * 1.1 }}>LushDate</Text>
    </View>
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
