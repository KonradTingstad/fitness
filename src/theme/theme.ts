export const palette = {
  ink: '#111418',
  ink2: '#1A1F26',
  ink3: '#232A33',
  paper: '#F7F8FA',
  paper2: '#FFFFFF',
  lineDark: '#303845',
  lineLight: '#DDE2EA',
  textDark: '#F3F5F8',
  textLight: '#111827',
  mutedDark: '#A2AAB6',
  mutedLight: '#667085',
  green: '#35C77A',
  amber: '#F4B740',
  red: '#F25F5C',
  blue: '#5DADEC',
  violet: '#9B8CFF',
};

export interface AppTheme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    warning: string;
    danger: string;
    info: string;
    accent: string;
  };
  spacing: (value: number) => number;
  radius: {
    sm: number;
    md: number;
  };
}

export function useAppTheme(): AppTheme {
  // Force dark mode globally for a consistent dark UI.
  const dark = true;
  return {
    dark,
    colors: {
      background: palette.ink,
      surface: palette.ink2,
      surfaceAlt: palette.ink3,
      border: palette.lineDark,
      text: palette.textDark,
      muted: palette.mutedDark,
      primary: palette.green,
      warning: palette.amber,
      danger: palette.red,
      info: palette.blue,
      accent: palette.violet,
    },
    spacing: (value) => value * 4,
    radius: {
      sm: 6,
      md: 8,
    },
  };
}

export const font = {
  hero: 28,
  title: 20,
  section: 15,
  body: 13,
  small: 10,
};
