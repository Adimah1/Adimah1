import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { REVENUECAT_KEY } from './env';
import { supabase } from './supabase';

/** Must match the entitlement id configured in RevenueCat. */
export const PLUS_ENTITLEMENT = 'plus';
/** Offering whose packages are boost consumables. */
export const BOOST_OFFERING = 'boosts';

export const purchasesAvailable = Platform.OS !== 'web' && REVENUECAT_KEY.length > 0;

let configuredFor: string | null = null;

/** Configures RevenueCat for the signed-in user (app user id = Supabase user id). */
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesAvailable) return;
  if (configuredFor === null) {
    Purchases.configure({ apiKey: REVENUECAT_KEY, appUserID: userId });
  } else if (configuredFor !== userId) {
    await Purchases.logIn(userId);
  }
  configuredFor = userId;
}

export async function resetPurchases(): Promise<void> {
  if (!purchasesAvailable || configuredFor === null) return;
  await Purchases.logOut().catch(() => undefined);
  configuredFor = null;
}

export function isCancelled(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'userCancelled' in error && !!error.userCancelled;
}

/**
 * Whether the user has LushDate+. The server's entitlements table (fed by the
 * RevenueCat webhook) is the source of truth for what the API allows.
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

/** Polls the server briefly after a purchase while the webhook lands. */
export async function waitForServer(check: () => Promise<boolean>, attempts = 10): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export type { PurchasesPackage };
