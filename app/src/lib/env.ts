import { Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const REVENUECAT_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ?? '';

/** Demo mode: an in-memory backend with pretend people, for previewing the app. */
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

export const isSupabaseConfigured = IS_DEMO || (SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0);
