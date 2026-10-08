import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

import { Glass } from './Glass';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['planet-outline', 'planet'],
  likes: ['heart-outline', 'heart'],
  chats: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'],
  me: ['person-circle-outline', 'person-circle'],
};

/** Height the floating bar covers, so screens can pad their content above it. */
export const TAB_BAR_SPACE = 104;

/** Floating frosted pill with a glowing badge behind the active tab. */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      <Glass radius={32} intensity={60} style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const [outline, filled] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          const { options } = descriptors[route.key];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.title ?? route.name}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.item}
            >
              {focused ? (
                <LinearGradient colors={t.glow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.glow}>
                  <Ionicons name={filled} size={24} color="#fff" />
                </LinearGradient>
              ) : (
                <Ionicons name={outline} size={25} color="rgba(255,255,255,0.75)" />
              )}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, alignItems: 'stretch' },
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 68, paddingHorizontal: 8 },
  item: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center' },
  glow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF4F8B',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
});
