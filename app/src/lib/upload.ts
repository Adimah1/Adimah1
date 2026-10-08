import type { ImagePickerAsset } from 'expo-image-picker';

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from './supabase';

const MAX_EDGE = 1600;

async function stripMetadata(uri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const image = await context.renderAsync();
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width || 1, image.height || 1));
    if (scale < 1) {
      context.resize({ width: Math.round(image.width * scale) });
      const resized = await context.renderAsync();
      return (await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri;
    }
    return (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri;
  } catch (err) {
    // Never upload an unprocessed original.
    throw new Error(`Couldn’t prepare this photo (${String(err)}). Please try another.`);
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Uploads a picked image to `bucket` under `folder/` and returns its storage
 * path. The bucket's storage policies decide whether the caller may write there.
 */
export async function uploadImage(
  bucket: 'photos' | 'snaps' | 'verifications',
  folder: string,
  asset: ImagePickerAsset,
): Promise<string> {
  // Re-encode as JPEG: strips EXIF metadata (GPS position, device, time)
  // so a photo can never reveal where someone lives.
  const clean = await stripMetadata(asset.uri);
  const contentType = 'image/jpeg';
  const path = `${folder}/${randomId()}.${EXTENSIONS[contentType]}`;
  const body = await (await fetch(clean)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
  if (error) throw error;
  return path;
}
