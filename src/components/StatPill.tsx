import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

interface Props {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn' | 'danger' | 'info';
}

export function StatPill({ label, value, tone = 'default' }: Props) {
  const theme = useAppTheme();
  const color =
    tone === 'good'
      ? theme.colors.primary
      : tone === 'warn'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : tone === 'info'
            ? theme.colors.info
            : theme.colors.muted;
  return (
    <View style={[styles.root, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
      <AppText variant="small" muted>
        {label}
      </AppText>
      <AppText weight="800" style={{ color }}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 2,
    minHeight: 52,
    padding: 8,
  },
});
