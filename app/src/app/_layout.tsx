import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AlertHost } from '@/components/AlertHost';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <AuthProvider>
        <RootNavigator />
        <AlertHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const t = useTheme();
  const { loading, session, profile } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <EmptyState
          emoji="🛠️"
          title="LushDate isn't configured yet"
          body="Copy app/.env.example to app/.env, add your Supabase URL and anon key, then restart the dev server."
        />
      </Screen>
    );
  }
  if (loading) return <Loading />;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;

  return (
    <Stack
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: t.background },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.background },
        // The default back arrow is an image asset; draw it with the icon font on web.
        headerLeft:
          Platform.OS === 'web' && navigation.canGoBack()
            ? () => (
                <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => navigation.goBack()}>
                  <Ionicons name="chevron-back" size={26} color={t.text} />
                </Pressable>
              )
            : undefined,
      })}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat/[matchId]" options={{ title: '' }} />
        <Stack.Screen
          name="snap/[messageId]"
          options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
        />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'LushDate+' }} />
        <Stack.Screen name="report/[userId]" options={{ presentation: 'modal', title: 'Report' }} />
        <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="verify" options={{ title: 'Get verified' }} />
        <Stack.Screen name="safety" options={{ title: 'Safety' }} />
      </Stack.Protected>
    </Stack>
  );
}
