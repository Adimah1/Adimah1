import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Whether the user has LushDate+. The server's entitlements table (written
 * only when Paystack confirms a payment) is the source of truth.
 */
export function usePlus(userId: string | undefined) {
  const [isPlus, setIsPlus] = useState(false);

  const refresh = useCallback(async () => {
    setIsPlus(await hasPlus(userId));
  }, [userId]);

  useEffect(() => {
    let active = true;
    hasPlus(userId).then((value) => {
      if (active) setIsPlus(value);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return { isPlus, refresh };
}

export async function hasPlus(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from('entitlements').select('expires_at').eq('user_id', userId).maybeSingle();
  return !!data?.expires_at && new Date(data.expires_at) > new Date();
}

/** Polls the server briefly after a purchase while it catches up. */
export async function waitForServer(check: () => Promise<boolean>, attempts = 10): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}
