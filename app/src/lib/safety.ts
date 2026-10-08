import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { showAlert } from './alert';
import { errorMessage, supabase } from './supabase';

/** The "…" menu on profiles and chats: panic, report or block someone. */
export function openSafetyMenu(userId: string, name: string, onBlocked: () => void) {
  showAlert(name, undefined, [
    { text: 'I feel unsafe', style: 'destructive', onPress: () => confirmPanic(userId, name, onBlocked) },
    {
      text: `Report ${name}`,
      onPress: () => router.push({ pathname: '/report/[userId]', params: { userId, name } }),
    },
    { text: `Block ${name}`, style: 'destructive', onPress: () => confirmBlock(userId, name, onBlocked) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function confirmBlock(userId: string, name: string, onBlocked: () => void) {
  showAlert(
    `Block ${name}?`,
    'You won’t see each other anywhere on LushDate, and your chat will be deleted. They won’t be told.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('block_user', { target: userId });
          if (error) {
            showAlert('Could not block', errorMessage(error));
            return;
          }
          onBlocked();
        },
      },
    ],
  );
}

/**
 * Panic button: blocks the person (which also deletes the chat), texts the
 * user's emergency contact with their location, and offers an emergency call.
 */
export function confirmPanic(userId: string, name: string, onBlocked: () => void) {
  showAlert('Get help now?', `We’ll block ${name}, delete your chat, and text your emergency contact your location.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes, get help', style: 'destructive', onPress: () => runPanic(userId, onBlocked) },
  ]);
}

async function runPanic(userId: string, onBlocked: () => void) {
  await supabase.rpc('block_user', { target: userId });
  let coords: { lat: number; lng: number } | null = null;
  try {
    if (Platform.OS !== 'web') {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    }
  } catch {
    // Still alert the contact without a location.
  }
  const { data } = await supabase.functions.invoke<{ notified: boolean; reason?: string }>('panic', {
    body: coords ?? {},
  });
  onBlocked();
  showAlert(
    data?.notified ? 'Your emergency contact has been alerted' : 'You’re safe from them on LushDate',
    data?.notified
      ? 'They’ve been blocked and your chat is gone. If you’re in danger, call emergency services now.'
      : data?.reason === 'no_contact'
        ? 'They’ve been blocked and your chat is gone. Add an emergency contact in Safety so we can alert them next time. If you’re in danger, call emergency services now.'
        : 'They’ve been blocked and your chat is gone. If you’re in danger, call emergency services now.',
    [
      { text: 'Call 911', style: 'destructive', onPress: () => Linking.openURL('tel:911') },
      { text: 'OK', style: 'cancel' },
    ],
  );
}
