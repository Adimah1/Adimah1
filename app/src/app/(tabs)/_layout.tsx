import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { GlassTabBar } from '@/components/GlassTabBar';
import { useUserId } from '@/lib/auth';
import { useLocationSync } from '@/lib/location';
import { configurePurchases } from '@/lib/purchases';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const userId = useUserId();
  useLocationSync(true);

  // Ring when a match video calls us, wherever we are in the app.
  useEffect(() => {
    const channel = supabase
      .channel('incoming-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${userId}` },
        (payload) => {
          const call = payload.new as { id: string; status: string };
          if (call.status === 'ringing') router.push({ pathname: '/call/[callId]', params: { callId: call.id } });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Tapping a notification opens the call or chat it's about.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { callId?: string; matchId?: string };
      if (data.callId) router.push({ pathname: '/call/[callId]', params: { callId: data.callId } });
      else if (data.matchId) router.push({ pathname: '/chat/[matchId]', params: { matchId: data.matchId } });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    configurePurchases(userId).catch((e) => console.warn('RevenueCat setup failed', e));
    registerForPush(userId).catch((e) => console.warn('Push registration failed', e));
  }, [userId]);

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.background } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Nearby' }} />
      <Tabs.Screen name="likes" options={{ title: 'Likes' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
    </Tabs>
  );
}
