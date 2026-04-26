import { useFocusEffect } from '@react-navigation/native';
import { PropsWithChildren, useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/AppBackground';
import { useAppTheme } from '@/theme/theme';

interface Props extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  resetScrollOnBlur?: boolean;
}

export function Screen({ children, scroll = true, padded = true, style, resetScrollOnBlur = false }: Props) {
  const theme = useAppTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const contentStyle = [styles.content, padded && { padding: theme.spacing(4) }, style];

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!resetScrollOnBlur || !scroll) {
          return;
        }
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      };
    }, [resetScrollOnBlur, scroll]),
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppBackground />
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView ref={scrollViewRef} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
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
