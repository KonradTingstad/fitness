import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/AppBackground';
import { useAppTheme } from '@/theme/theme';

interface Props extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = true, padded = true, style }: Props) {
  const theme = useAppTheme();
  const contentStyle = [styles.content, padded && { padding: theme.spacing(4) }, style];
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppBackground />
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 24,
  },
});
