import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Round control used on the call screens (mute, camera, accept, end…). */
export function CallButton({
  icon,
  label,
  onPress,
  active = false,
  danger = false,
  success = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
  disabled?: boolean;
}) {
  const background = danger ? '#E5484D' : success ? '#30A46C' : active ? '#fff' : 'rgba(255,255,255,0.2)';
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        ]}
      >
        <Ionicons
          name={icon}
          size={28}
          color={active ? '#170612' : '#fff'}
          style={danger && icon === 'call' ? { transform: [{ rotate: '135deg' }] } : undefined}
        />
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  button: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
