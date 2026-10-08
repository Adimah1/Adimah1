import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { IS_DEMO } from './env';
import { reportLocation } from './security';
import { supabase } from './supabase';

export const formatMoney = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Turns a place name/address into coordinates for the venue check-in. */
export async function locatePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  if (IS_DEMO || Platform.OS === 'web') return { lat: 40.741, lng: -73.9897 };
  const results = await Location.geocodeAsync(query);
  return results[0] ? { lat: results[0].latitude, lng: results[0].longitude } : null;
}

/** Current position for checking in, with the device's own mock-location flag. */
export async function checkInPosition() {
  if (IS_DEMO || Platform.OS === 'web') return { lat: 40.741, lng: -73.9897, mocked: false, accuracy: 10 };
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location access is needed to check in.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  // Also refresh the general location (keeps the integrity history current).
  reportLocation({ ...p.coords, mocked: p.mocked }).catch(() => undefined);
  return { lat: p.coords.latitude, lng: p.coords.longitude, mocked: p.mocked === true, accuracy: p.coords.accuracy };
}

const CHECK_IN_REASONS: Record<string, string> = {
  too_far: 'You need to be at the place to check in (within about 250 m).',
  outside_window: 'Check-in opens 30 minutes before your date and closes 90 minutes after it starts.',
  location_untrusted: 'We couldn’t trust your location. Turn off any location-changing apps and try again.',
  not_confirmed: 'Both deposits need to be in place first.',
};

export function checkInMessage(reason: string | undefined): string {
  return (reason && CHECK_IN_REASONS[reason]) || 'Check-in didn’t work. Please try again.';
}

export async function myCredit(): Promise<number> {
  const { data } = await supabase.rpc('my_credit_balance');
  return (data as number | null) ?? 0;
}
