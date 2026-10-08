import type { ImagePickerAsset } from 'expo-image-picker';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface ImageInputProps {
  /** Where the photo comes from. "choose" lets the person pick camera or library. */
  source: 'library' | 'camera' | 'choose';
  /** For the camera: which side. */
  cameraType?: 'front' | 'back';
  /** Crop to this aspect ratio when the platform supports editing. */
  aspect?: [number, number];
  onPick: (asset: ImagePickerAsset) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}
