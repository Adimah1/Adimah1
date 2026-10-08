import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, photoUrl, supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { uploadImage } from '@/lib/upload';

import { ImageInput } from './ImageInput';
import { showAlert } from '@/lib/alert';

export const MAX_PHOTOS = 6;

type PhotoVerdict = { ok: true } | { ok: false; message: string };

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

  async function add(asset: ImagePickerAsset) {
    setUploading(true);
    try {
      const path = await uploadImage('photos', userId, asset);
      // Only real photos of the person are allowed: the server rejects drawings,
      // cartoons, AI-generated images, photos without a face, and explicit images.
      const { data, error } = await supabase.functions.invoke<PhotoVerdict>('check-photo', { body: { path } });
      if (error || !data) {
        await supabase.storage.from('photos').remove([path]);
        throw new Error('We couldn’t check this photo. Please try again.');
      }
      if (!data.ok) {
        showAlert('Photo not added', data.message);
        return;
      }
      onChange([...photos, path]);
    } catch (e) {
      showAlert('Upload failed', errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function remove(path: string) {
    showAlert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(photos.filter((p) => p !== path)) },
    ]);
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i]);
  return (
    <View style={styles.grid}>
      {slots.map((path, i) => {
        const isNext = !path && i === photos.length;
        if (isNext) {
          return (
            <ImageInput
              key={`next-${i}`}
              source="library"
              aspect={[4, 5]}
              onPick={add}
              disabled={uploading}
              accessibilityLabel="Add photo"
              style={[styles.slot, { backgroundColor: t.surface, borderColor: t.primary }]}
            >
              {uploading ? (
                <ActivityIndicator color={t.primary} />
              ) : (
                <Ionicons name="add" size={32} color={t.primary} />
              )}
            </ImageInput>
          );
        }
        return (
          <Pressable
            key={path ?? `empty-${i}`}
            accessibilityLabel={path ? `Photo ${i + 1}, tap to remove` : 'Empty photo slot'}
            disabled={!path}
            onPress={() => path && remove(path)}
            style={[styles.slot, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            {path ? (
              <>
                <Image source={{ uri: photoUrl(path) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {i === 0 ? <View style={[styles.mainBadge, { backgroundColor: t.primary }]} /> : null}
              </>
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
