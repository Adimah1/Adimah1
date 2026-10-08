import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { setAlertListener, type PendingAlert } from '@/lib/alert';
import { radius, space, useTheme } from '@/lib/theme';

/** Renders showAlert() dialogs on web. Native platforms use the system alert. */
export function AlertHost() {
  const t = useTheme();
  const [alert, setAlert] = useState<PendingAlert | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setAlertListener(setAlert);
    return () => setAlertListener(null);
  }, []);

  if (!alert) return null;

  const cancel = alert.buttons.find((b) => b.style === 'cancel');
  const close = () => {
    setAlert(null);
    cancel?.onPress?.();
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.dialog, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={() => undefined}
        >
          <Text style={[styles.title, { color: t.text }]}>{alert.title}</Text>
          {alert.message ? <Text style={[styles.message, { color: t.muted }]}>{alert.message}</Text> : null}
          <View style={styles.buttons}>
            {alert.buttons.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                onPress={() => {
                  setAlert(null);
                  b.onPress?.();
                }}
                style={({ pressed }) => [
                  styles.button,
                  { borderTopColor: t.border, backgroundColor: pressed ? t.surfaceRaised : 'transparent' },
                ]}
              >
                <Text
                  style={{
                    color: b.style === 'destructive' ? t.danger : b.style === 'cancel' ? t.muted : t.primary,
                    fontWeight: b.style === 'cancel' ? '500' : '700',
                    fontSize: 16,
                  }}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  dialog: { width: '100%', maxWidth: 340, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.lg },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.sm },
  buttons: { marginTop: space.md },
  button: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, alignItems: 'center' },
});
