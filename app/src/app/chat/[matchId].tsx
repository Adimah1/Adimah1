import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { useUserId } from '@/lib/auth';
import { offerVideoCallUpgrade, startVideoCall } from '@/lib/calls';
import { usePlus } from '@/lib/purchases';
import { openSafetyMenu } from '@/lib/safety';
import { errorMessage, supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import type { MatchSummary, Message } from '@/lib/types';
import { uploadImage } from '@/lib/upload';
import { showAlert } from '@/lib/alert';

export default function Chat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingSnap, setUploadingSnap] = useState(false);
  const lastScreenshot = useRef(0);
  const { isPlus } = usePlus(userId);

  const upsert = useCallback((msg: Message) => {
    setMessages((cur) => {
      const i = cur.findIndex((m) => m.id === msg.id);
      if (i === -1) return [...cur, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const next = cur.slice();
      next[i] = msg;
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: matches }, { data: rows }] = await Promise.all([
        supabase.rpc('my_matches'),
        supabase
          .from('messages')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true })
          .limit(500),
      ]);
      setMatch(((matches ?? []) as MatchSummary[]).find((m) => m.match_id === matchId) ?? null);
      setMessages((rows ?? []) as Message[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`chat:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          upsert(payload.new as Message);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, upsert]);

  // Let the other person know if this chat is screenshotted (iOS and Android 14+).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      if (Date.now() - lastScreenshot.current < 5000) return;
      lastScreenshot.current = Date.now();
      supabase.from('messages').insert({ match_id: matchId, sender_id: userId, kind: 'screenshot' }).then();
    });
    return () => sub.remove();
  }, [matchId, userId]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { data, error } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: userId, kind: 'text', body })
      .select()
      .single();
    setSending(false);
    if (error) {
      showAlert('Message not sent', errorMessage(error));
      return;
    }
    setText('');
    upsert(data as Message);
  }

  function chooseSnap() {
    showAlert('Send a snap', 'It disappears after one view (or 24 hours unopened).', [
      { text: 'Take photo', onPress: () => sendSnap('camera') },
      { text: 'Choose from library', onPress: () => sendSnap('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function sendSnap(source: 'camera' | 'library') {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.7 };
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert('Camera access needed', 'Allow camera access in Settings to send snaps.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    if (result.canceled) return;

    setUploadingSnap(true);
    try {
      const path = await uploadImage('snaps', matchId, result.assets[0]);
      const { data, error } = await supabase
        .from('messages')
        .insert({ match_id: matchId, sender_id: userId, kind: 'snap', media_path: path })
        .select()
        .single();
      if (error) throw error;
      upsert(data as Message);
    } catch (e) {
      showAlert('Snap not sent', errorMessage(e));
    } finally {
      setUploadingSnap(false);
    }
  }

  if (loading) return <Loading />;
  if (!match) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState emoji="💨" title="Chat unavailable" body="This match has ended." />
      </Screen>
    );
  }

  const reversed = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      style={{ flex: 1, backgroundColor: t.background }}
    >
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: match.other_id } })}
              style={styles.headerTitle}
            >
              <Avatar path={match.photo} size={32} />
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 17 }}>{match.display_name}</Text>
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel={isPlus ? `Video call ${match.display_name}` : 'Video call (LushDate+)'}
                hitSlop={12}
                onPress={() => (isPlus ? startVideoCall(match.match_id) : offerVideoCallUpgrade(match.display_name))}
              >
                <Ionicons name="videocam" size={24} color={isPlus ? t.primary : t.muted} />
                {isPlus ? null : (
                  <View style={[styles.plusBadge, { backgroundColor: t.accent }]}>
                    <Text style={styles.plusBadgeText}>+</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                accessibilityLabel="Report or block"
                hitSlop={12}
                onPress={() => openSafetyMenu(match.other_id, match.display_name, () => router.navigate('/chats'))}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={t.text} />
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        inverted
        data={reversed}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        ListFooterComponent={
          <Text style={[styles.system, { color: t.muted, marginBottom: space.md }]}>
            You matched with {match.display_name}. Be kind, meet in public, and never send money to someone you haven’t
            met.
          </Text>
        }
        renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === userId} name={match.display_name} />}
      />

      <View style={[styles.composer, { borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <Pressable
          accessibilityLabel="Send a disappearing snap"
          onPress={chooseSnap}
          disabled={uploadingSnap}
          style={[styles.iconButton, { backgroundColor: t.surfaceRaised }]}
        >
          {uploadingSnap ? (
            <ActivityIndicator color={t.primary} />
          ) : (
            <Ionicons name="camera" size={22} color={t.primary} />
          )}
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={t.muted}
          multiline
          maxLength={2000}
          style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]}
        />
        <Pressable
          accessibilityLabel="Send"
          onPress={send}
          disabled={sending || !text.trim()}
          style={[styles.iconButton, { backgroundColor: text.trim() ? t.primary : t.surfaceRaised }]}
        >
          <Ionicons name="arrow-up" size={22} color={text.trim() ? '#fff' : t.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine, name }: { message: Message; mine: boolean; name: string }) {
  const t = useTheme();

  if (message.kind === 'screenshot') {
    return <Text style={[styles.system, { color: t.accent }]}>📸 {mine ? 'You' : name} took a screenshot</Text>;
  }

  if (message.kind === 'snap') {
    const expired = !!message.expires_at && new Date(message.expires_at) < new Date();
    const openable = !mine && !message.viewed_at && !expired && !!message.media_path;
    const label = mine
      ? message.viewed_at
        ? 'Snap · Opened'
        : 'Snap · Delivered'
      : message.viewed_at
        ? 'Snap · Opened'
        : expired
          ? 'Snap · Expired'
          : 'Tap to view snap';
    return (
      <Pressable
        disabled={!openable}
        onPress={() => router.push({ pathname: '/snap/[messageId]', params: { messageId: message.id } })}
        style={[
          styles.bubble,
          styles.snap,
          mine ? styles.mine : styles.theirs,
          { borderColor: openable ? t.primary : t.border, backgroundColor: t.surface },
        ]}
      >
        <Ionicons name={openable ? 'square' : 'square-outline'} size={16} color={openable ? t.primary : t.muted} />
        <Text style={{ color: openable ? t.primary : t.muted, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        { backgroundColor: mine ? t.primary : t.surfaceRaised },
      ]}
    >
      <Text style={{ color: mine ? '#fff' : t.text, fontSize: 16, lineHeight: 22 }}>{message.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  plusBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBadgeText: { color: '#2A0A1F', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  snap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5 },
  system: { textAlign: 'center', fontSize: 13, lineHeight: 18, paddingHorizontal: space.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
  },
});
