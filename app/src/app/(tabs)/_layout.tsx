import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';

import { useUserId } from '@/lib/auth';
import { useLocationSync } from '@/lib/location';
import { configurePurchases } from '@/lib/purchases';
import { registerForPush } from '@/lib/push';
import { useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName, focusedName: IconName) {
  function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? focusedName : name} color={color as string} size={size} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const t = useTheme();
  const userId = useUserId();
  useLocationSync(true);

  useEffect(() => {
    configurePurchases(userId).catch((e) => console.warn('RevenueCat setup failed', e));
    registerForPush(userId).catch((e) => console.warn('Push registration failed', e));
  }, [userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Nearby', tabBarIcon: icon('location-outline', 'location') }} />
      <Tabs.Screen name="likes" options={{ title: 'Likes', tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: icon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
