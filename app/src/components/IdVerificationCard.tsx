import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { showAlert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

import { Glass } from './Glass';
import { Button } from './ui';

/**
 * Level 2 verification: government ID + liveness (selfie video) through our
 * KYC provider. Required for money features (date deposits). The result
 * comes back to the server by webhook; the app only opens the flow.
 */
export function IdVerificationCard() {
  const t = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const status = profile?.kyc_status ?? 'none';

  async function start() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string; status?: string; error?: string }>(
        'kyc-start',
        { body: {} },
      );
      if (error || !data) throw error ?? new Error('Couldn’t start ID verification');
      if (data.error) throw new Error(data.error);
      if (data.url) await WebBrowser.openAuthSessionAsync(data.url, 'lushdate://verify');
      await refreshProfile();
    } catch (e) {
      showAlert('ID verification', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Glass style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.head}>
          <Ionicons name="id-card" size={24} color={status === 'approved' ? t.success : t.accent} />
          <Text style={styles.title}>{status === 'approved' ? 'ID verified' : 'Verify your ID'}</Text>
        </View>
        {status === 'approved' ? (
          <Text style={styles.body}>Date deposits are unlocked. Your ID details are never shown on your profile.</Text>
        ) : (
          <>
            <Text style={styles.body}>
              Scan a government ID and take a short live selfie video. Needed for date deposits, and it keeps scammers
              out: one person, one account. Your ID is checked by our verification partner and never shown to anyone.
            </Text>
            {status === 'pending' ? (
              <>
                <Text style={[styles.body, { color: t.accent }]}>
                  ⏳ We’re checking your ID. This usually takes a few minutes.
                </Text>
                <Button title="Refresh" variant="secondary" onPress={refreshProfile} />
              </>
            ) : (
              <>
                {status === 'rejected' ? (
                  <Text style={[styles.body, { color: t.danger }]}>
                    Your last attempt didn’t go through. Use good lighting and an unexpired ID.
                  </Text>
                ) : null}
                <Button title="Verify my ID" onPress={start} loading={busy} />
              </>
            )}
          </>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: {},
  inner: { padding: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  body: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 20 },
});
