import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUserId } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';

const VIEW_SECONDS = 10;

/**
 * Full-screen, view-once snap. Opening it marks it viewed on the server; the
 * image is downloaded through a 60-second signed URL and never saved to disk.
 */
export default function SnapViewer() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const userId = useUserId();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress] = useState(() => new Animated.Value(1));

  // Block screenshots/recording (Android) and hide content in the app switcher.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenCapture.preventScreenCaptureAsync('snap').catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync('snap').catch(() => undefined);
    };
  }, []);

  // iOS can't block screenshots, so tell the sender instead.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = ScreenCapture.addScreenshotListener(async () => {
      const { data } = await supabase.from('messages').select('match_id').eq('id', messageId).single();
      if (data) {
        await supabase.from('messages').insert({ match_id: data.match_id, sender_id: userId, kind: 'screenshot' });
      }
    });
    return () => sub.remove();
  }, [messageId, userId]);

  useEffect(() => {
    (async () => {
      const { data: path, error: openError } = await supabase.rpc('open_snap', { message_id: messageId });
      if (openError || !path) {
        setError(errorMessage(openError));
        return;
      }
      const { data, error: urlError } = await supabase.storage.from('snaps').createSignedUrl(path as string, 60);
      if (urlError || !data) {
        setError(errorMessage(urlError));
        return;
      }
      setUri(data.signedUrl);
    })();
  }, [messageId]);

  function start() {
    Animated.timing(progress, { toValue: 0, duration: VIEW_SECONDS * 1000, useNativeDriver: false }).start(
      ({ finished }) => {
        if (finished) router.back();
      },
    );
  }

  return (
    <Pressable style={styles.container} onPress={() => router.back()} accessibilityLabel="Close snap">
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="none"
          onLoad={start}
        />
      ) : error ? (
        <Text style={styles.message}>{error}</Text>
      ) : (
        <ActivityIndicator color="#fff" size="large" />
      )}
      <View style={[styles.track, { top: insets.top + 8 }]}>
        <Animated.View
          style={[styles.bar, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  message: { color: '#fff', fontSize: 17, textAlign: 'center', padding: 32 },
  track: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  bar: { height: 3, borderRadius: 2, backgroundColor: '#fff' },
});
