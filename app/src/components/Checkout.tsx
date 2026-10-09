import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { checkout, type PaymentResult } from '@/lib/payments';
import { radius, space, useTheme } from '@/lib/theme';

type Ask = { message: string; resolve: (email: string | null) => void };

/**
 * Paystack checkout with the one-time billing email prompt. Render `prompt`
 * somewhere in the screen; call `pay(fn, body)` to run a payment.
 */
export function useCheckout() {
  const [ask, setAsk] = useState<Ask | null>(null);

  const pay = useCallback(async (fn: string, body: Record<string, unknown>): Promise<PaymentResult> => {
    let email: string | undefined;
    for (;;) {
      const result = await checkout(fn, email ? { ...body, email } : body);
      if (result.ok || !result.needEmail) return result;
      const answer = await new Promise<string | null>((resolve) => setAsk({ message: result.message, resolve }));
      setAsk(null);
      if (!answer) return { ok: false, cancelled: true, message: '' };
      email = answer;
    }
  }, []);

  const prompt = ask ? <EmailPrompt message={ask.message} onDone={ask.resolve} /> : null;

  return { pay, prompt };
}

function EmailPrompt({ message, onDone }: { message: string; onDone: (email: string | null) => void }) {
  const t = useTheme();
  const [email, setEmail] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={() => onDone(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.glassBorder }]}>
          <Text style={[styles.title, { color: t.text }]}>Email for receipts</Text>
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
            {message} Paystack sends your receipts here. It isn’t shown on your profile.
          </Text>
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            autoFocus
          />
          <Button title="Continue to payment" onPress={() => onDone(email.trim())} disabled={!email.includes('@')} />
          <Button title="Cancel" variant="ghost" onPress={() => onDone(null)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  title: { fontSize: 20, fontWeight: '800' },
});
