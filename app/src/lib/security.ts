import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export interface LocationVerdict {
  verdict: 'ok' | 'suspect' | 'rejected';
  reasons: string[];
}

/**
 * Sends a location to the server, which adds IP signals and applies the
 * integrity rules (mock locations, impossible travel, VPNs) before storing an
 * approximate position.
 */
export async function reportLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked?: boolean;
}): Promise<LocationVerdict | null> {
  const { data, error } = await supabase.functions.invoke<LocationVerdict>('report-location', {
    body: {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      mocked: coords.mocked === true,
      // Play Integrity / App Attest isn't wired up yet (see docs/SECURITY.md).
      attestation: 'unavailable',
    },
  });
  if (error) {
    console.warn('report-location failed', error.message);
    return null;
  }
  return data;
}

/**
 * Registers a hash of this install's device identifier, so bans follow the
 * device (ban evasion) and device farms stand out. The raw id never leaves
 * the phone.
 */
export async function registerDevice(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = Platform.OS === 'ios' ? await Application.getIosIdForVendorAsync() : Application.getAndroidId();
  if (!id) return;
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `lushdate-device:${id}`);
  await supabase.rpc('register_device', { p_device_hash: hash });
}

const LOCATION_MESSAGES: Record<string, string> = {
  vpn: 'Your location couldn’t be verified while a VPN is on. Turn it off to show as verified nearby.',
  mock_location: 'A fake-location app was detected, so your location wasn’t updated.',
  impossible_travel: 'Your location jumped too far, too fast, so it wasn’t updated.',
  device_integrity: 'This device didn’t pass our security check, so your location wasn’t updated.',
  account_frozen: 'Your account is under review.',
};

/** A short explanation for the person when their location wasn't accepted. */
export function locationProblem(verdict: LocationVerdict | null): string | null {
  if (!verdict || verdict.verdict === 'ok') return null;
  for (const reason of verdict.reasons) {
    if (LOCATION_MESSAGES[reason]) return LOCATION_MESSAGES[reason];
  }
  return null;
}
