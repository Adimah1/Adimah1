import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MAX_PHOTOS, PhotoEditor } from '@/components/PhotoEditor';
import { Button, Chip, Field, Muted, Screen, Title } from '@/components/ui';
import { useAuth, useUserId } from '@/lib/auth';
import { ageFrom, parseBirthdate } from '@/lib/format';
import { useLocationSync } from '@/lib/location';
import { errorMessage, supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import { GENDER_LABELS, GENDER_SELF_LABELS, LOOKING_FOR_LABELS, type Gender, type LookingFor } from '@/lib/types';
import { showAlert } from '@/lib/alert';

const MIN_PHOTOS = 2;
const STEPS = ['name', 'birthday', 'gender', 'interested', 'about', 'photos', 'location'] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const t = useTheme();
  const userId = useUserId();
  const { refreshProfile, signOut } = useAuth();
  const { sync } = useLocationSync(false);

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [birthInput, setBirthInput] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [lookingFor, setLookingFor] = useState<LookingFor>('not_sure');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const birthdate = parseBirthdate(birthInput);
  const age = birthdate ? ageFrom(birthdate) : null;
  const index = STEPS.indexOf(step);

  const canContinue: Record<Step, boolean> = {
    name: name.trim().length > 0,
    birthday: age !== null && age >= 18 && age < 100,
    gender: gender !== null,
    interested: interestedIn.length > 0,
    about: true,
    photos: photos.length >= MIN_PHOTOS,
    location: true,
  };

  function next() {
    if (step === 'birthday' && age !== null && age < 18) return;
    setStep(STEPS[index + 1]);
  }

  async function finish() {
    if (!birthdate || !gender) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').insert({
      id: userId,
      display_name: name.trim(),
      birthdate,
      gender,
      interested_in: interestedIn,
      looking_for: lookingFor,
      bio: bio.trim(),
      photos,
    });
    if (error) {
      setSaving(false);
      showAlert('Could not create your profile', errorMessage(error));
      return;
    }
    try {
      await sync();
    } catch {
      // Location can be granted later from the Nearby tab.
    }
    await refreshProfile();
    setSaving(false);
  }

  function toggleInterest(g: Gender) {
    setInterestedIn((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.progress}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, { backgroundColor: i <= index ? t.primary : t.border }]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 'name' && (
            <>
              <Title>What’s your first name?</Title>
              <Muted>This is how you’ll appear on LushDate.</Muted>
              <Field
                value={name}
                onChangeText={setName}
                placeholder="First name"
                autoFocus
                maxLength={40}
                autoComplete="given-name"
              />
            </>
          )}

          {step === 'birthday' && (
            <>
              <Title>When’s your birthday?</Title>
              <Muted>Only your age is shown. You can’t change this later.</Muted>
              <Field
                value={birthInput}
                onChangeText={setBirthInput}
                placeholder="MM/DD/YYYY"
                keyboardType="numbers-and-punctuation"
                autoFocus
                maxLength={10}
              />
              {age !== null && age < 18 ? (
                <Text style={{ color: t.danger, fontSize: 15 }}>Sorry — LushDate is only for adults 18 and over.</Text>
              ) : age !== null ? (
                <Muted>You’re {age}.</Muted>
              ) : null}
            </>
          )}

          {step === 'gender' && (
            <>
              <Title>I am a…</Title>
              <View style={styles.chips}>
                {(Object.keys(GENDER_SELF_LABELS) as Gender[]).map((g) => (
                  <Chip key={g} label={GENDER_SELF_LABELS[g]} selected={gender === g} onPress={() => setGender(g)} />
                ))}
              </View>
            </>
          )}

          {step === 'interested' && (
            <>
              <Title>Show me…</Title>
              <Muted>Pick everyone you’d like to see nearby.</Muted>
              <View style={styles.chips}>
                {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                  <Chip
                    key={g}
                    label={GENDER_LABELS[g]}
                    selected={interestedIn.includes(g)}
                    onPress={() => toggleInterest(g)}
                  />
                ))}
              </View>
            </>
          )}

          {step === 'about' && (
            <>
              <Title>What are you looking for?</Title>
              <View style={styles.chips}>
                {(Object.keys(LOOKING_FOR_LABELS) as LookingFor[]).map((l) => (
                  <Chip
                    key={l}
                    label={LOOKING_FOR_LABELS[l]}
                    selected={lookingFor === l}
                    onPress={() => setLookingFor(l)}
                  />
                ))}
              </View>
              <Field
                label="Bio (optional)"
                value={bio}
                onChangeText={setBio}
                placeholder="Coffee snob, sunset chaser, will judge your playlist…"
                multiline
                maxLength={500}
              />
            </>
          )}

          {step === 'photos' && (
            <>
              <Title>Add your photos</Title>
              <Muted>
                Add at least {MIN_PHOTOS} (up to {MAX_PHOTOS}) real photos of yourself, with your face showing. Your
                first photo is your main one.
              </Muted>
              <Muted>
                Drawings, cartoons, AI-generated images, photos of other people and explicit photos aren’t allowed and
                are removed automatically.
              </Muted>
              <PhotoEditor userId={userId} photos={photos} onChange={setPhotos} />
            </>
          )}

          {step === 'location' && (
            <>
              <Title>See who’s nearby</Title>
              <Muted>
                LushDate uses your location to show people around you. We only ever store an approximate area (about a
                quarter mile) and only show others a rounded distance — never your exact spot.
              </Muted>
              <Muted>You can pause your profile at any time to disappear from the feed.</Muted>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === 'location' ? (
            <Button title="Enable location & finish" onPress={finish} loading={saving} />
          ) : (
            <Button title="Continue" onPress={next} disabled={!canContinue[step]} />
          )}
          {index > 0 ? (
            <Button title="Back" variant="ghost" onPress={() => setStep(STEPS[index - 1])} />
          ) : (
            <Button title="Sign out" variant="ghost" onPress={signOut} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: space.lg, paddingTop: space.md },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  body: { padding: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { padding: space.lg, gap: space.xs },
});
