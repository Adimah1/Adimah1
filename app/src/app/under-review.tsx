import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Glass } from '@/components/Glass';
import { Button, Field, Muted, Screen } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import { fonts, space } from '@/lib/theme';

const REASONS: Record<string, string> = {
  multiple_reports: 'Several people reported your account in a short time.',
  location_spoofing: 'Your location looked faked several times (for example by a location-changing app).',
  ban_evasion: 'This device was used by an account that was removed.',
  risk_score: 'Our safety systems noticed activity that often comes from scam accounts.',
};

/** Shown instead of the app while an account is frozen or banned. */
export default function UnderReview() {
  const { account, refreshProfile, signOut } = useAuth();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const banned = account?.status === 'banned';

  async function appeal() {
    setBusy(true);
    const { error } = await supabase.rpc('submit_appeal', { p_message: message });
    setBusy(false);
    if (error) {
      showAlert('Appeal not sent', errorMessage(error));
      return;
    }
    setMessage('');
    await refreshProfile();
    showAlert('Appeal sent', 'A person on our safety team will review your account, usually within 48 hours.');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Ionicons name="shield-half" size={56} color="#FFC56E" />
        <Text style={styles.title}>{banned ? 'Your account was removed' : 'Your account is under review'}</Text>
        <Muted>
          {(account?.reason && REASONS[account.reason]) ||
            'Our safety team needs to take a look before you can keep using LushDate.'}{' '}
          While we review, your profile is hidden and you can’t send messages. Your matches can’t see why.
        </Muted>
        {account?.appeal_open ? (
          <Glass style={styles.card}>
            <Text style={styles.cardText}>
              ✓ Your appeal is with our team. We’ll email or text you with the outcome.
            </Text>
          </Glass>
        ) : (
          <>
            <Field
              label="Tell us what happened (optional detail helps)"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={2000}
              placeholder="e.g. I was travelling, or I share a phone with my sister"
            />
            <Button title="Send appeal" onPress={appeal} loading={busy} disabled={!message.trim()} />
          </>
        )}
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, paddingTop: space.xl * 2, gap: space.md },
  title: { color: '#fff', fontFamily: fonts.serif, fontSize: 38, lineHeight: 42 },
  card: { padding: space.md },
  cardText: { color: '#fff', fontSize: 15, lineHeight: 21 },
});
