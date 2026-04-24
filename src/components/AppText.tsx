import { PropsWithChildren } from 'react';
import { Text, TextProps } from 'react-native';

import { font, useAppTheme } from '@/theme/theme';

interface Props extends TextProps, PropsWithChildren {
  variant?: 'hero' | 'title' | 'section' | 'body' | 'small' | 'metric';
  muted?: boolean;
  weight?: '500' | '600' | '700' | '800';
}

export function AppText({ children, variant = 'body', muted, weight, style, ...props }: Props) {
  const theme = useAppTheme();
  const size =
    variant === 'hero'
      ? font.hero
      : variant === 'title'
        ? font.title
        : variant === 'section'
          ? font.section
        : variant === 'small'
            ? font.small
            : variant === 'metric'
              ? 24
              : font.body;
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? theme.colors.muted : theme.colors.text,
          fontSize: size,
          fontWeight: weight ?? (variant === 'body' || variant === 'small' ? '500' : '700'),
          letterSpacing: 0,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
