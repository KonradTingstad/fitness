import { useFocusEffect } from '@react-navigation/native';
import { PropsWithChildren, useCallback, useRef } from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/AppBackground';
import { useWorkoutOverlayPadding } from '@/features/workouts/hooks/useWorkoutOverlayPadding';
import { useFloatingTabBarClearance } from '@/navigation/tabBarMetrics';
import { useAppTheme } from '@/theme/theme';

interface Props extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  resetScrollOnBlur?: boolean;
  backgroundVariant?: 'app' | 'plain';
  safeAreaEdges?: Edge[];
  contentInsetAdjustmentBehavior?: ScrollViewProps['contentInsetAdjustmentBehavior'];
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  resetScrollOnBlur = false,
  backgroundVariant = 'app',
  safeAreaEdges,
  contentInsetAdjustmentBehavior,
}: Props) {
  const theme = useAppTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const tabBarClearance = useFloatingTabBarClearance(8);
  const bottomPadding = useWorkoutOverlayPadding(24 + tabBarClearance);
  const contentStyle = [styles.content, { paddingBottom: bottomPadding }, padded && { padding: theme.spacing(4) }, style];

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
      {backgroundVariant === 'app' ? <AppBackground /> : null}
      <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>
        {scroll ? (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
          >
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
  },
});
