import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { toE164 } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { space } from '@/lib/theme';

export default function SignIn() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const e164 = toE164(phoneInput);
    if (!e164) {
      Alert.alert(
        'Check your number',
        'Enter a mobile number, including the country code if you are outside the US (e.g. +44…).',
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) {
      Alert.alert('Could not send code', errorMessage(error));
      return;
    }
    setPhone(e164);
  }

  async function verify() {
    if (!phone) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) Alert.alert('That code didn’t work', errorMessage(error));
    // On success the auth guard in _layout moves on to onboarding or the app.
  }

  return (
    <LinearGradient colors={['#3B0B2C', '#170612']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Ionicons name="heart" size={40} color="#fff" />
            </View>
            <Text style={styles.brand}>LushDate</Text>
            <Text style={styles.tagline}>See who’s actually around you.{'\n'}Chat in moments that vanish.</Text>
          </View>

          {phone === null ? (
            <View style={styles.form}>
              <Field
                label="Mobile number"
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="(555) 555-0100"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />
              <Button title="Text me a code" onPress={sendCode} loading={busy} disabled={!phoneInput} />
              <Text style={styles.fine}>
                LushDate is for adults 18+. By continuing you agree to our Terms and Privacy Policy.
              </Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                label={`Code sent to ${phone}`}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
              <Button title="Continue" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
              <Button
                title="Use a different number"
                variant="ghost"
                onPress={() => {
                  setPhone(null);
                  setCode('');
                }}
              />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', padding: space.lg },
  hero: { alignItems: 'center', marginTop: space.xl * 2, gap: space.md },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF4F8B',
  },
  brand: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  tagline: { color: '#F6CFE0', fontSize: 17, textAlign: 'center', lineHeight: 24 },
  form: { gap: space.md, marginBottom: space.lg },
  fine: { color: '#C9A3B6', fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
