import * as ImagePicker from 'expo-image-picker';
import { Pressable } from 'react-native';

import { showAlert } from '@/lib/alert';

import type { ImageInputProps } from './ImageInput.types';

/** A tappable area that opens the photo library or camera and returns the picked photo. */
export function ImageInput({
  source,
  cameraType,
  aspect,
  onPick,
  disabled,
  accessibilityLabel,
  style,
  children,
}: ImageInputProps) {
  async function open(from: 'library' | 'camera') {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: 'images',
      quality: 0.7,
      ...(aspect ? { allowsEditing: true, aspect } : null),
    };
    let result: ImagePicker.ImagePickerResult;
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert('Camera access needed', 'Allow camera access for LushDate in Settings.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        ...options,
        cameraType: cameraType === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    if (!result.canceled) onPick(result.assets[0]);
  }

  function press() {
    if (source !== 'choose') {
      open(source);
      return;
    }
    showAlert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => open('camera') },
      { text: 'Choose from library', onPress: () => open('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={press}
      style={style}
    >
      {children}
    </Pressable>
  );
}
