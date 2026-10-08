import { Image } from 'expo-image';
import { View } from 'react-native';

import { photoUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/** Profile photo, round by default or as a rounded square ("squircle"). */
export function Avatar({
  path,
  size,
  ring,
  shape = 'circle',
  online = false,
}: {
  path: string | null;
  size: number;
  ring?: string;
  shape?: 'circle' | 'square';
  online?: boolean;
}) {
  const t = useTheme();
  const r = shape === 'circle' ? size / 2 : size * 0.3;
  const dot = Math.max(10, size * 0.2);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          flex: 1,
          borderRadius: r,
          padding: ring ? 2 : 0,
          borderWidth: ring ? 2 : 0,
          borderColor: ring,
          backgroundColor: t.surface,
          overflow: 'hidden',
        }}
      >
        {path ? (
          <Image
            source={{ uri: photoUrl(path) }}
            style={{ flex: 1, borderRadius: ring ? r - 4 : r }}
            contentFit="cover"
          />
        ) : null}
      </View>
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: t.success,
            borderWidth: 2,
            borderColor: t.background,
          }}
        />
      ) : null}
    </View>
  );
}
