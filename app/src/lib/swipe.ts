import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { showAlert } from './alert';
import { errorMessage, supabase } from './supabase';

/**
 * Like or pass on someone. Celebrates a mutual like with a "Say hi" prompt.
 * Returns false if the swipe didn't go through.
 */
export async function swipeOn(
  person: { id: string; display_name: string },
  liked: boolean,
  onKeepBrowsing?: () => void,
  /** Replace the current screen with the chat (e.g. when swiping from a profile page). */
  replace = false,
): Promise<boolean> {
  const { data: matchId, error } = await supabase.rpc('swipe', { target: person.id, liked });
  if (error) {
    showAlert('Something went wrong', errorMessage(error));
    return false;
  }
  if (liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  if (matchId) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    showAlert('It’s a match! 💘', `You and ${person.display_name} like each other.`, [
      { text: 'Keep browsing', style: 'cancel', onPress: onKeepBrowsing },
      {
        text: 'Say hi',
        onPress: () => {
          const target = { pathname: '/chat/[matchId]' as const, params: { matchId: matchId as string } };
          if (replace) router.replace(target);
          else router.push(target);
        },
      },
    ]);
  } else {
    onKeepBrowsing?.();
  }
  return true;
}
