import { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { LucideProps } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useAppTheme } from '@/theme/theme';

interface Props {
  icon: ComponentType<LucideProps>;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, body, actionLabel, onAction }: Props) {
  const theme = useAppTheme();
  return (
    <View style={[styles.root, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={[styles.icon, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon size={28} color={theme.colors.muted} />
      </View>
      <AppText variant="section">{title}</AppText>
      <AppText muted style={styles.body}>
        {body}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 18,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  body: {
    lineHeight: 21,
    textAlign: 'center',
  },
});
