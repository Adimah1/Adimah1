import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  registerGlobals,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { CallButton } from './CallButton';
import type { VideoRoomProps } from './VideoRoom.types';

registerGlobals();

/** A live two-person video call over LiveKit. */
export function VideoRoom({ token, serverUrl, otherName, otherPhoto, onHangUp }: VideoRoomProps) {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  return (
    <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onHangUp}>
      <Room otherName={otherName} otherPhoto={otherPhoto} onHangUp={onHangUp} />
    </LiveKitRoom>
  );
}

function Room({ otherName, otherPhoto, onHangUp }: Omit<VideoRoomProps, 'token' | 'serverUrl'>) {
  const insets = useSafeAreaInsets();
  const tracks = useTracks([Track.Source.Camera]).filter(isTrackReference);
  const mine = tracks.find((t) => t.participant.isLocal);
  const theirs = tracks.find((t) => !t.participant.isLocal);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, cameraTrack } = useLocalParticipant();
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  async function flip() {
    const next = facing === 'user' ? 'environment' : 'user';
    await (cameraTrack?.track as LocalVideoTrack | undefined)?.restartTrack({ facingMode: next });
    setFacing(next);
  }

  return (
    <View style={styles.container}>
      {theirs ? (
        <VideoTrack trackRef={theirs} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      ) : (
        <View style={styles.waiting}>
          <Avatar path={otherPhoto} size={120} />
          <Text style={styles.waitingText}>Waiting for {otherName}…</Text>
        </View>
      )}

      {mine && isCameraEnabled ? (
        <View style={[styles.self, { top: insets.top + 12 }]}>
          <VideoTrack
            trackRef={mine}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={facing === 'user'}
            zOrder={1}
          />
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <CallButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          active={!isMicrophoneEnabled}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        <CallButton
          icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
          label={isCameraEnabled ? 'Camera off' : 'Camera on'}
          active={!isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
        <CallButton icon="camera-reverse" label="Flip" onPress={flip} disabled={!isCameraEnabled} />
        <CallButton icon="call" label="End" danger onPress={onHangUp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  waitingText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  self: {
    position: 'absolute',
    right: 12,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
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
