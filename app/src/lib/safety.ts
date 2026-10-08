import { router } from 'expo-router';
import { Alert } from 'react-native';

import { errorMessage, supabase } from './supabase';

/** The "…" menu on profiles and chats: report or block someone. */
export function openSafetyMenu(userId: string, name: string, onBlocked: () => void) {
  Alert.alert(name, undefined, [
    {
      text: `Report ${name}`,
      onPress: () => router.push({ pathname: '/report/[userId]', params: { userId, name } }),
    },
    { text: `Block ${name}`, style: 'destructive', onPress: () => confirmBlock(userId, name, onBlocked) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function confirmBlock(userId: string, name: string, onBlocked: () => void) {
  Alert.alert(
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
            Alert.alert('Could not block', errorMessage(error));
            return;
          }
          onBlocked();
        },
      },
    ],
  );
}
