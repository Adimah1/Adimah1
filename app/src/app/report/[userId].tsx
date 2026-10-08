import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, Field, Muted, Screen } from '@/components/ui';
import { confirmBlock } from '@/lib/safety';
import { errorMessage, supabase } from '@/lib/supabase';
import { space } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

const REASONS = [
  { id: 'fake_profile', label: 'Fake profile' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate_content', label: 'Inappropriate photos or messages' },
  { id: 'scam', label: 'Asking for money' },
  { id: 'underage', label: 'Might be under 18' },
  { id: 'safety_concern', label: 'I feel unsafe' },
  { id: 'other', label: 'Something else' },
] as const;

export default function Report() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const who = name ?? 'this person';
  const [reason, setReason] = useState<(typeof REASONS)[number]['id'] | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    const { error } = await supabase.from('reports').insert({ reported_id: userId, reason, details: details.trim() });
    setBusy(false);
    if (error) {
      showAlert('Report not sent', errorMessage(error));
      return;
    }
    showAlert('Thanks for telling us', `Our team will review this. Do you also want to block ${who}?`, [
      { text: 'Not now', style: 'cancel', onPress: () => router.back() },
      { text: 'Block', style: 'destructive', onPress: () => confirmBlock(userId, who, () => router.dismissAll()) },
    ]);
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Muted>
          Reports are confidential — {who} won’t know it was you. If you’re in danger, call your local emergency number.
        </Muted>
        <View style={styles.reasons}>
          {REASONS.map((r) => (
            <Chip key={r.id} label={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />
          ))}
        </View>
        <Field label="Anything else? (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
        <Button title="Send report" onPress={submit} loading={busy} disabled={!reason} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
