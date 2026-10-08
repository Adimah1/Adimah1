import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CherryLogo } from '@/components/Brand';
import { Glass } from '@/components/Glass';
import { Button, Field } from '@/components/ui';
import { ChatPreview, PhotoFan, SafetyPreview } from '@/components/WelcomeArt';
import { showAlert } from '@/lib/alert';
import { toE164 } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { fonts, space, useTheme } from '@/lib/theme';

const SLIDES = [
  {
    key: 'nearby',
    Art: PhotoFan,
    title: 'Find your spark,\nright nearby',
    body: 'See who’s around you right now — down the street, not across the city.',
  },
  {
    key: 'vanish',
    Art: ChatPreview,
    title: 'Chats that\nvanish',
    body: 'Send snaps that disappear after one look, and video call before you meet.',
  },
  {
    key: 'safe',
    Art: SafetyPreview,
    title: 'Real people,\nkept safe',
    body: 'Real photos, verified selfies and a location that’s never exact.',
  },
];

type Stage = 'welcome' | 'phone' | 'code';

export default function SignIn() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const slider = useRef<ScrollView>(null);
  const [stage, setStage] = useState<Stage>('welcome');
  const [slide, setSlide] = useState(0);
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  function onSlideScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== slide) setSlide(i);
  }

  function next() {
    if (slide < SLIDES.length - 1) {
      slider.current?.scrollTo({ x: width * (slide + 1), animated: true });
      setSlide(slide + 1);
    } else {
      setStage('phone');
    }
  }

  async function sendCode() {
    const e164 = toE164(phoneInput);
    if (!e164) {
      showAlert(
        'Check your number',
        'Enter a mobile number, including the country code if you are outside the US (e.g. +44…).',
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) {
      showAlert('Could not send code', errorMessage(error));
      return;
    }
    setPhone(e164);
    setStage('code');
  }

  async function verify() {
    if (!phone) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) showAlert('That code didn’t work', errorMessage(error));
    // On success the auth guard in _layout moves on to onboarding or the app.
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <LinearGradient
        colors={['#2A0A10', '#0B0A0C', '#0B0A0C']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          {stage === 'welcome' ? (
            <View style={styles.brand}>
              <CherryLogo height={30} />
              <Text style={styles.brandText}>LushDate</Text>
            </View>
          ) : (
            <Pressable
              accessibilityLabel="Back"
              hitSlop={10}
              onPress={() => setStage(stage === 'code' ? 'phone' : 'welcome')}
            >
              <Glass radius={22} style={styles.back}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </Glass>
            </Pressable>
          )}
          {stage === 'welcome' && slide < SLIDES.length - 1 ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setStage('phone')}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          ) : null}
        </View>

        {stage === 'welcome' ? (
          <>
            <ScrollView
              ref={slider}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onSlideScroll}
              scrollEventThrottle={32}
              style={{ flex: 1 }}
            >
              {SLIDES.map(({ key, Art, title, body }) => (
                <View key={key} style={{ width, flex: 1 }}>
                  <View style={styles.art}>
                    <Art />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.body}>{body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.dots}>
                {SLIDES.map((s, i) => (
                  <View key={s.key} style={[styles.dot, i === slide ? styles.dotActive : null]} />
                ))}
              </View>
              <Button title={slide === SLIDES.length - 1 ? 'Get started' : 'Next'} onPress={next} />
              <Pressable accessibilityRole="button" onPress={() => setStage('phone')} style={styles.signInLink}>
                <Text style={styles.signInText}>
                  Already have an account? <Text style={{ color: '#fff', fontWeight: '700' }}>Sign in</Text>
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.formArt}>
              <PhotoFan scale={0.7} />
            </View>
            <Glass radius={32} intensity={50} style={styles.sheet}>
              <View style={styles.sheetInner}>
                {stage === 'phone' ? (
                  <>
                    <Text style={styles.sheetTitle}>What’s your number?</Text>
                    <Text style={styles.sheetBody}>
                      We’ll text you a code. Your number is never shown on your profile.
                    </Text>
                    <Field
                      value={phoneInput}
                      onChangeText={setPhoneInput}
                      placeholder="(555) 555-0100"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      autoFocus
                    />
                    <Button title="Text me a code" onPress={sendCode} loading={busy} disabled={!phoneInput} />
                  </>
                ) : (
                  <>
                    <Text style={styles.sheetTitle}>Enter your code</Text>
                    <Text style={styles.sheetBody}>Sent to {phone}</Text>
                    <Field
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
                  </>
                )}
                <Text style={styles.fine}>
                  LushDate is for adults 18+. By continuing you agree to our Terms and Privacy Policy.
                </Text>
              </View>
            </Glass>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    minHeight: 52,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { color: '#fff', fontFamily: fonts.serif, fontSize: 26 },
  skip: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  art: { flex: 1, minHeight: 280 },
  copy: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: 10 },
  title: { color: '#fff', fontFamily: fonts.serif, fontSize: 46, lineHeight: 50 },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 23, maxWidth: 360 },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 26, backgroundColor: '#FF2E4D' },
  signInLink: { alignItems: 'center', paddingVertical: 4 },
  signInText: { color: 'rgba(255,255,255,0.65)', fontSize: 15 },
  formArt: { flex: 1, minHeight: 200 },
  sheet: { marginHorizontal: 12, marginBottom: 12 },
  sheetInner: { padding: 22, gap: 14 },
  sheetTitle: { color: '#fff', fontFamily: fonts.serif, fontSize: 36, lineHeight: 40 },
  sheetBody: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 21, marginTop: -6 },
  fine: { color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
