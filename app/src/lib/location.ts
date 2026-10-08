import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

export type LocationStatus = 'unknown' | 'granted' | 'denied';

/**
 * Sends the device's approximate position to the server when the app comes to
 * the foreground. The server snaps it to a ~450 m grid before storing it.
 */
export function useLocationSync(enabled: boolean) {
  const [status, setStatus] = useState<LocationStatus>('unknown');

  const sync = useCallback(async () => {
    const next = await pushLocation();
    setStatus(next);
    return next === 'granted';
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const run = () =>
      pushLocation()
        .then(setStatus)
        .catch((e) => console.warn('location sync failed', e));
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [enabled]);

  return { status, sync };
}

async function pushLocation(): Promise<LocationStatus> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { error } = await supabase.rpc('update_location', {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  });
  if (error) console.warn('update_location failed', error.message);
  return 'granted';
}
