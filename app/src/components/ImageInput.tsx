import type { ImagePickerAsset } from 'expo-image-picker';
import type { ChangeEvent } from 'react';
import { View } from 'react-native';

import type { ImageInputProps } from './ImageInput.types';

/**
 * Web version: a real, invisible <input type="file"> covers the area, so the
 * person's own tap opens the photo chooser. (Opening a hidden input from code
 * is blocked by many mobile browsers, iOS Safari in particular.)
 */
export function ImageInput({
  source,
  cameraType,
  onPick,
  disabled,
  accessibilityLabel,
  style,
  children,
}: ImageInputProps) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const asset: ImagePickerAsset = {
      uri: URL.createObjectURL(file),
      width: 0,
      height: 0,
      type: 'image',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'image/jpeg',
    };
    onPick(asset);
  }

  const capture = source === 'camera' ? (cameraType === 'front' ? 'user' : 'environment') : undefined;

  return (
    <View style={[style, { position: 'relative' }]}>
      {children}
      {disabled ? null : (
        <input
          type="file"
          accept="image/*"
          capture={capture}
          aria-label={accessibilityLabel}
          onChange={change}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            fontSize: 0,
          }}
        />
      )}
    </View>
  );
}
