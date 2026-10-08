/**
 * LushDate's look: near-black, glassy surfaces, a rose accent, a serif
 * wordmark and a condensed display face for names on photo cards.
 * The app is dark-only by design (see app.json userInterfaceStyle).
 */
const palette = {
  background: '#0B0A0C',
  surface: '#17151A',
  surfaceRaised: '#221F26',
  border: '#2E2A33',
  glass: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  muted: '#A49CA8',
  primary: '#FF4F8B',
  primaryText: '#FFFFFF',
  accent: '#FFC56E',
  live: '#FF5A1F',
  info: '#2F8CFF',
  success: '#3DDC84',
  danger: '#FF5C5C',
  gradient: ['#FF4F8B', '#B02A7A'] as const,
  glow: ['#FF7AB0', '#8F5BFF', '#3FA9FF'] as const,
};

export type Theme = typeof palette;

export function useTheme(): Theme {
  return palette;
}

export const fonts = {
  /** Wordmark and page names. */
  serif: 'InstrumentSerif_400Regular',
  /** Names on photo cards, uppercase. */
  display: 'Anton_400Regular',
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
