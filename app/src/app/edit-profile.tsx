import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PhotoEditor } from '@/components/PhotoEditor';
import { Button, Chip, Field, Screen } from '@/components/ui';
import { useAuth, useUserId } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { GENDER_LABELS, LOOKING_FOR_LABELS, type Gender, type LookingFor } from '@/lib/types';
import { showAlert } from '@/lib/alert';

export default function EditProfile() {
  const t = useTheme();
  const userId = useUserId();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [lookingFor, setLookingFor] = useState<LookingFor>(profile?.looking_for ?? 'not_sure');
  const [interestedIn, setInterestedIn] = useState<Gender[]>(profile?.interested_in ?? []);
  const [ageMin, setAgeMin] = useState(profile?.age_min ?? 18);
  const [ageMax, setAgeMax] = useState(profile?.age_max ?? 99);
  const [photos, setPhotos] = useState<string[]>(profile?.photos ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        bio: bio.trim(),
        looking_for: lookingFor,
        interested_in: interestedIn,
        age_min: ageMin,
        age_max: ageMax,
        photos,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      showAlert('Could not save', errorMessage(error));
      return;
    }
    await refreshProfile();
    router.back();
  }

  function toggle(g: Gender) {
    setInterestedIn((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  }

  const valid = name.trim().length > 0 && interestedIn.length > 0 && photos.length >= 1;

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Section title="Photos">
            <PhotoEditor userId={userId} photos={photos} onChange={setPhotos} />
          </Section>
          <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
          <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={500} />
          <Section title="Looking for">
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
          </Section>
          <Section title="Show me">
            <View style={styles.chips}>
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                <Chip key={g} label={GENDER_LABELS[g]} selected={interestedIn.includes(g)} onPress={() => toggle(g)} />
              ))}
            </View>
          </Section>
          <Section title={`Age range: ${ageMin}–${ageMax === 99 ? '99+' : ageMax}`}>
            <View style={styles.steppers}>
              <Stepper label="Min" value={ageMin} min={18} max={ageMax} onChange={setAgeMin} />
              <Stepper label="Max" value={ageMax} min={ageMin} max={99} onChange={setAgeMax} />
            </View>
          </Section>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            Your birthday and gender can’t be changed here. Contact support if they’re wrong.
          </Text>
        </ScrollView>
        <View style={{ padding: space.lg }}>
          <Button title="Save" onPress={save} loading={saving} disabled={!valid} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const t = useTheme();
  const button = (delta: number, symbol: string) => (
    <Pressable
      accessibilityLabel={`${label} age ${delta > 0 ? 'up' : 'down'}`}
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      style={[styles.stepButton, { backgroundColor: t.surfaceRaised }]}
    >
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{symbol}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { borderColor: t.border, backgroundColor: t.surface }]}>
      {button(-1, '−')}
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', minWidth: 48, textAlign: 'center' }}>{value}</Text>
      {button(1, '+')}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  steppers: { flexDirection: 'row', gap: space.md },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
  },
  stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
