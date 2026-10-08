import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { reportLocation, type LocationVerdict } from './security';

export type LocationStatus = 'unknown' | 'granted' | 'denied';

/**
 * Sends the device's position to the server when the app comes to the
 * foreground. The server checks it (spoofing, VPNs, impossible travel) and
 * stores only an approximate point on a ~450 m grid.
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
  lastVerdict = await reportLocation({ ...position.coords, mocked: position.mocked });
  return 'granted';
}

let lastVerdict: LocationVerdict | null = null;

/** The server's verdict on the most recent location update. */
export function lastLocationVerdict(): LocationVerdict | null {
  return lastVerdict;
}
