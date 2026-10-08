import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { photoUrl } from '@/lib/supabase';

import { CallButton } from './CallButton';
import type { VideoRoomProps } from './VideoRoom.types';

/**
 * Browser version. Live video runs in the iOS/Android app (VideoRoom.native);
 * on the web the call screen explains that.
 */
export function VideoRoom({ otherName, otherPhoto, onHangUp }: VideoRoomProps) {
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {otherPhoto ? (
        <Image source={{ uri: photoUrl(otherPhoto) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.name}>{otherName}</Text>
        <Text style={styles.clock}>{clock}</Text>
        <Text style={styles.note}>Video calls work in the LushDate iOS and Android app.</Text>
      </View>

      <View style={[styles.self, { top: insets.top + 12 }]}>
        <Text style={styles.selfText}>{cameraOff ? 'Camera off' : 'Your camera'}</Text>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <CallButton
          icon={muted ? 'mic-off' : 'mic'}
          label={muted ? 'Unmute' : 'Mute'}
          active={muted}
          onPress={() => setMuted(!muted)}
        />
        <CallButton
          icon={cameraOff ? 'videocam-off' : 'videocam'}
          label={cameraOff ? 'Camera on' : 'Camera off'}
          active={cameraOff}
          onPress={() => setCameraOff(!cameraOff)}
        />
        <CallButton icon="call" label="End" danger onPress={onHangUp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { alignItems: 'center', gap: 4, paddingHorizontal: 140 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800' },
  clock: { color: '#fff', fontSize: 15, fontVariant: ['tabular-nums'] },
  note: { color: '#F6CFE0', fontSize: 12, textAlign: 'center' },
  self: {
    position: 'absolute',
    right: 12,
    width: 100,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#2A1424',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfText: { color: '#C9A3B6', fontSize: 12 },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
});
