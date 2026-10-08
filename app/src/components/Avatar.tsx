import { Image } from 'expo-image';
import { View } from 'react-native';

import { photoUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export function Avatar({ path, size, ring }: { path: string | null; size: number; ring?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: ring ? 2 : 0,
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
        backgroundColor: t.surface,
      }}
    >
      {path ? (
        <Image source={{ uri: photoUrl(path) }} style={{ flex: 1, borderRadius: size / 2 }} contentFit="cover" />
      ) : null}
    </View>
  );
}
