import { router } from 'expo-router';

import { showAlert } from './alert';
import { errorMessage, supabase } from './supabase';

/** Starts a video call with a match. The server only allows this for LushDate+ members. */
export async function startVideoCall(matchId: string) {
  const { data, error } = await supabase.rpc('start_call', { p_match_id: matchId });
  if (error) {
    if (/LushDate\+ required/.test(error.message)) {
      router.push('/paywall');
      return;
    }
    showAlert('Couldn’t start the call', errorMessage(error));
    return;
  }
  router.push({ pathname: '/call/[callId]', params: { callId: data as string } });
}

/** Ask for a video call while not on LushDate+. */
export function offerVideoCallUpgrade(name: string) {
  showAlert(
    'Video calls are a LushDate+ feature',
    `Upgrade to video call ${name} before you meet. Answering calls is free for everyone.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'See LushDate+', onPress: () => router.push('/paywall') },
    ],
  );
}
