import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.root}>
      <ActivityIndicator color={theme.colors.primary} />
      <AppText muted>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 180,
  },
});
