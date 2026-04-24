import { ComponentType } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { LucideProps } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

interface Props {
  label: string;
  onPress: () => void;
  icon?: ComponentType<LucideProps>;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  style?: ViewStyle;
  disabled?: boolean;
}

export function Button({ label, onPress, icon: Icon, variant = 'primary', style, disabled }: Props) {
  const theme = useAppTheme();
  const backgroundColor =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.surfaceAlt
          : 'transparent';
  const textColor = variant === 'primary' || variant === 'danger' ? '#08100C' : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: variant === 'ghost' ? theme.colors.border : backgroundColor,
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={16} color={textColor} strokeWidth={2.4} /> : null}
      <AppText style={{ color: textColor }} weight="800">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
