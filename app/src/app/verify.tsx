import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Muted, Screen } from '@/components/ui';
import { useAuth, useUserId } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import { uploadImage } from '@/lib/upload';

type Status = 'none' | 'pending' | 'approved' | 'rejected';

/**
 * Selfie verification: the user copies a pose, and a moderator compares the
 * selfie with their profile photos (see README → Moderation).
 */
export default function Verify() {
  const t = useTheme();
  const userId = useUserId();
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('verification_requests')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setStatus((data?.status as Status | undefined) ?? 'none'));
  }, [userId]);

  async function takeSelfie() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to get verified.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      cameraType: ImagePicker.CameraType.front,
      quality: 0.7,
    });
    if (result.canceled) return;
    setBusy(true);
    try {
      const path = await uploadImage('verifications', userId, result.assets[0]);
      const { error } = await supabase.from('verification_requests').insert({ user_id: userId, selfie_path: path });
      if (error) throw error;
      setStatus('pending');
    } catch (e) {
      Alert.alert('Could not submit', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (profile?.verified || status === 'approved') {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 64 }}>✅</Text>
          <Text style={[styles.title, { color: t.text }]}>You’re verified</Text>
          <Muted center>Your profile shows a blue check so people know you’re real.</Muted>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.text }]}>Show you’re really you</Text>
        <Muted>Verified profiles get a blue check and more matches. Take a selfie copying this pose:</Muted>
        <Card style={styles.pose}>
          <Text style={{ fontSize: 72 }}>✌️🙂</Text>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>Peace sign next to your face</Text>
        </Card>
        <Muted>
          A member of our team compares it with your profile photos. Your selfie is only seen by our review team and is
          never shown on your profile.
        </Muted>
        {status === 'pending' ? (
          <Text style={{ color: t.accent, fontWeight: '700', textAlign: 'center' }}>
            ⏳ Your selfie is being reviewed
          </Text>
        ) : (
          <>
            {status === 'rejected' ? (
              <Text style={{ color: t.danger, textAlign: 'center' }}>
                We couldn’t match your last selfie to your photos. Please try again with good lighting.
              </Text>
            ) : null}
            <Button title="Take selfie" onPress={takeSelfie} loading={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  title: { fontSize: 26, fontWeight: '800' },
  pose: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
