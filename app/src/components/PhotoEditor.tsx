import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, photoUrl } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { uploadImage } from '@/lib/upload';

export const MAX_PHOTOS = 6;

/** A 3x2 grid of profile photo slots. Tap an empty slot to add, a photo to remove. */
export function PhotoEditor({
  userId,
  photos,
  onChange,
}: {
  userId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const t = useTheme();
  const [uploading, setUploading] = useState(false);

  async function add() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.7,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const path = await uploadImage('photos', userId, result.assets[0]);
      onChange([...photos, path]);
    } catch (e) {
      Alert.alert('Upload failed', errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function remove(path: string) {
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(photos.filter((p) => p !== path)) },
    ]);
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i]);
  return (
    <View style={styles.grid}>
      {slots.map((path, i) => {
        const isNext = !path && i === photos.length;
        return (
          <Pressable
            key={path ?? `empty-${i}`}
            accessibilityLabel={path ? `Photo ${i + 1}, tap to remove` : 'Add photo'}
            onPress={() => (path ? remove(path) : isNext && !uploading ? add() : undefined)}
            style={[styles.slot, { backgroundColor: t.surface, borderColor: isNext ? t.primary : t.border }]}
          >
            {path ? (
              <>
                <Image source={{ uri: photoUrl(path) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {i === 0 ? <View style={[styles.mainBadge, { backgroundColor: t.primary }]} /> : null}
              </>
            ) : isNext && uploading ? (
              <ActivityIndicator color={t.primary} />
            ) : isNext ? (
              <Ionicons name="add" size={32} color={t.primary} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: {
    width: '31.5%',
    aspectRatio: 4 / 5,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBadge: { position: 'absolute', top: 6, left: 6, width: 10, height: 10, borderRadius: 5 },
});
