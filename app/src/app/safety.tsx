import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Card, Field, Muted, Screen } from '@/components/ui';
import { useAuth, useUserId } from '@/lib/auth';
import { toE164 } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

const TIPS = [
  { emoji: '☕', text: 'Meet in a busy public place for the first few dates.' },
  { emoji: '📲', text: 'Tell a friend where you’re going and who you’re meeting.' },
  { emoji: '🚗', text: 'Get yourself there and back — don’t rely on your date for a ride.' },
  { emoji: '💸', text: 'Never send money, gift cards or crypto to someone you’ve met online. Report anyone who asks.' },
  { emoji: '🔒', text: 'Keep chats on LushDate until you trust someone. Don’t share your address early on.' },
];

interface Blocked {
  id: string;
  display_name: string;
  photo: string | null;
}

export default function Safety() {
  const t = useTheme();
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const { profile, refreshProfile } = useAuth();
  const userId = useUserId();
  const [contactName, setContactName] = useState(profile?.emergency_contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(profile?.emergency_contact_phone ?? '');
  const [savingContact, setSavingContact] = useState(false);

  async function saveContact() {
    const phone = contactPhone.trim() ? toE164(contactPhone) : null;
    if (contactPhone.trim() && !phone) {
      showAlert('Check the number', 'Enter a mobile number with its country code, e.g. +1 555 555 0100.');
      return;
    }
    setSavingContact(true);
    const { error } = await supabase
      .from('profiles')
      .update({ emergency_contact_name: contactName.trim() || null, emergency_contact_phone: phone })
      .eq('id', userId);
    setSavingContact(false);
    if (error) {
      showAlert('Not saved', errorMessage(error));
      return;
    }
    await refreshProfile();
    showAlert(
      'Saved',
      phone ? `We’ll text ${contactName.trim() || phone} if you press the panic button.` : 'Emergency contact removed.',
    );
  }

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_blocks');
    setBlocked((data ?? []) as Blocked[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function unblock(person: Blocked) {
    showAlert(
      `Unblock ${person.display_name}?`,
      'You may see each other in Nearby again. Your old chat won’t come back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            const { error } = await supabase.rpc('unblock_user', { target: person.id });
            if (error) showAlert('Could not unblock', errorMessage(error));
            load();
          },
        },
      ],
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Card style={{ gap: space.md, borderColor: t.danger }}>
          <Text style={[styles.heading, { color: t.text }]}>In an emergency</Text>
          <Muted>If you’re in immediate danger, call emergency services now.</Muted>
          <Button title="Call 911" variant="danger" onPress={() => Linking.openURL('tel:911')} />
        </Card>

        <Text style={[styles.heading, { color: t.text }]}>Emergency contact</Text>
        <Muted>If you press “I feel unsafe” in a chat, we block that person and text this contact your location.</Muted>
        <Field
          label="Name"
          value={contactName}
          onChangeText={setContactName}
          placeholder="e.g. Sam (sister)"
          maxLength={60}
        />
        <Field
          label="Mobile number"
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="+1 555 555 0100"
          keyboardType="phone-pad"
        />
        <Button title="Save emergency contact" variant="secondary" onPress={saveContact} loading={savingContact} />

        <Text style={[styles.heading, { color: t.text }]}>Dating safely</Text>
        {TIPS.map((tip) => (
          <View key={tip.text} style={styles.tip}>
            <Text style={{ fontSize: 22 }}>{tip.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Muted>{tip.text}</Muted>
            </View>
          </View>
        ))}

        <Text style={[styles.heading, { color: t.text }]}>Blocked</Text>
        {blocked.length === 0 ? (
          <Muted>You haven’t blocked anyone.</Muted>
        ) : (
          blocked.map((person) => (
            <View key={person.id} style={styles.blockedRow}>
              <Avatar path={person.photo} size={44} />
              <Text style={{ color: t.text, flex: 1, fontWeight: '600' }}>{person.display_name}</Text>
              <Button title="Unblock" variant="secondary" onPress={() => unblock(person)} />
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
  heading: { fontSize: 20, fontWeight: '800', marginTop: space.sm },
  tip: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
