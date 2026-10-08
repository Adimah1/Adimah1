import { useColorScheme } from 'react-native';

const dark = {
  background: '#170612',
  surface: '#26101F',
  surfaceRaised: '#341629',
  border: '#4A2239',
  text: '#FFF4F8',
  muted: '#C9A3B6',
  primary: '#FF4F8B',
  primaryText: '#FFFFFF',
  accent: '#FFC56E',
  success: '#5FD39A',
  danger: '#FF6B6B',
  gradient: ['#FF4F8B', '#B02A7A'] as const,
};

const light: typeof dark = {
  background: '#FFF7FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FBEAF1',
  border: '#F0D3E0',
  text: '#2A0A1F',
  muted: '#7A5468',
  primary: '#E0346F',
  primaryText: '#FFFFFF',
  accent: '#C98410',
  success: '#1F9D60',
  danger: '#D93838',
  gradient: ['#FF4F8B', '#B02A7A'] as const,
};

export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === 'light' ? light : dark;
}

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
