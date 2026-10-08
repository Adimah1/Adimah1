import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

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
  const contentType = asset.mimeType && EXTENSIONS[asset.mimeType] ? asset.mimeType : 'image/jpeg';
  const path = `${folder}/${randomId()}.${EXTENSIONS[contentType]}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
  if (error) throw error;
  return path;
}
