import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CallButton } from '@/components/CallButton';
import { Loading } from '@/components/ui';
import { VideoRoom } from '@/components/VideoRoom';
import { useUserId } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Call, CallStatus, MatchSummary } from '@/lib/types';

const RING_SECONDS = 45;

export default function CallScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const userId = useUserId();
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState<Call | null>(null);
  const [other, setOther] = useState<MatchSummary | null>(null);
  const [access, setAccess] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);

  // Load the call and who it's with, then follow status changes live.
  useEffect(() => {
    supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single()
      .then(async ({ data }) => {
        if (!data) {
          setError('This call is no longer available.');
          return;
        }
        const row = data as Call;
        const { data: matches } = await supabase.rpc('my_matches');
        setOther(((matches ?? []) as MatchSummary[]).find((m) => m.match_id === row.match_id) ?? null);
        setCall(row);
      });

    const channel = supabase
      .channel(`call:${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
        (payload) => setCall(payload.new as Call),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId]);

  const isCaller = call?.caller_id === userId;
  const status: CallStatus | undefined = call?.status;

  const leave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    await supabase.rpc('end_call', { p_call_id: callId });
    if (router.canGoBack()) router.back();
  }, [callId]);

  // Join the video room once the call is accepted.
  useEffect(() => {
    if (status !== 'accepted' || access) return;
    supabase.functions
      .invoke<{ token: string; url: string }>('call-token', { body: { callId } })
      .then(({ data, error: tokenError }) => {
        if (tokenError || !data) setError(errorMessage(tokenError));
        else setAccess(data);
      });
  }, [status, access, callId]);

  // The caller stops ringing after a while.
  useEffect(() => {
    if (!isCaller || status !== 'ringing') return;
    const timer = setTimeout(leave, RING_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [isCaller, status, leave]);

  // Close the screen shortly after the call finishes.
  useEffect(() => {
    if (status !== 'declined' && status !== 'missed' && status !== 'ended') return;
    const timer = setTimeout(() => {
      if (!leaving.current && router.canGoBack()) router.back();
      leaving.current = true;
    }, 1500);
    return () => clearTimeout(timer);
  }, [status]);

  async function answer(accept: boolean) {
    const { error: answerError } = await supabase.rpc('answer_call', { p_call_id: callId, accept });
    if (answerError) setError(errorMessage(answerError));
    if (!accept) {
      leaving.current = true;
      if (router.canGoBack()) router.back();
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>{error}</Text>
        <View style={[styles.actions, { paddingBottom: insets.bottom + 32 }]}>
          <CallButton icon="close" label="Close" onPress={() => router.back()} />
        </View>
      </View>
    );
  }
  if (!call || !other) return <Loading />;

  if (status === 'accepted' && access) {
    return (
      <VideoRoom
        token={access.token}
        serverUrl={access.url}
        otherName={other.display_name}
        otherPhoto={other.photo}
        onHangUp={leave}
      />
    );
  }

  const label =
    status === 'ringing'
      ? isCaller
        ? 'Calling…'
        : 'is video calling you'
      : status === 'accepted'
        ? 'Connecting…'
        : status === 'declined'
          ? `${other.display_name} can’t talk right now`
          : status === 'missed'
            ? 'No answer'
            : 'Call ended';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 80 }]}>
      <Avatar path={other.photo} size={140} ring="#FF4F8B" />
      <Text style={styles.name}>{other.display_name}</Text>
      <Text style={styles.status}>{label}</Text>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 32 }]}>
        {status === 'ringing' && !isCaller ? (
          <>
            <CallButton icon="call" label="Decline" danger onPress={() => answer(false)} />
            <CallButton icon="videocam" label="Accept" success onPress={() => answer(true)} />
          </>
        ) : status === 'ringing' || status === 'accepted' ? (
          <CallButton icon="call" label={isCaller && status === 'ringing' ? 'Cancel' : 'End'} danger onPress={leave} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#170612', alignItems: 'center', gap: 12 },
  name: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 12 },
  status: { color: '#F6CFE0', fontSize: 17, textAlign: 'center', paddingHorizontal: 24 },
  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
});
