import { Play, Pause, ChevronUp, Dumbbell } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

interface Props {
  title: string;
  elapsedLabel: string;
  paused: boolean;
  onOpen: () => void;
  onExpand: () => void;
  onTogglePause: () => void;
  bottom: number;
}

export function WorkoutMiniPlayer({ title, elapsedLabel, paused, onOpen, onExpand, onTogglePause, bottom }: Props) {
  const theme = useAppTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy < 0) {
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -34 || gesture.vy < -0.8) {
            Animated.timing(translateY, { toValue: -18, duration: 120, useNativeDriver: true }).start(() => {
              translateY.setValue(0);
              onExpand();
            });
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
        },
      }),
    [onExpand, translateY],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrap,
        {
          bottom,
          borderColor: theme.colors.border,
          backgroundColor: 'rgba(16,22,29,0.93)',
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.pressableBody, pressed && { opacity: 0.84 }]}>
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        </View>
        <View style={styles.row}>
          <View style={styles.left}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(53,199,122,0.18)', borderColor: 'rgba(53,199,122,0.36)' }]}>
              <Dumbbell size={15} color={theme.colors.primary} />
            </View>
            <View>
              <AppText weight="800" numberOfLines={1} style={styles.title}>
                {title}
              </AppText>
              <AppText muted variant="small">
                {elapsedLabel}
              </AppText>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onTogglePause}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              {paused ? <Play size={15} color={theme.colors.text} /> : <Pause size={15} color={theme.colors.text} />}
            </Pressable>
            <Pressable
              onPress={onExpand}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <ChevronUp size={15} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    left: 12,
    position: 'absolute',
    right: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    zIndex: 25,
  },
  pressableBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
  },
  handleRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    borderRadius: 999,
    height: 4,
    width: 38,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  title: {
    maxWidth: 190,
  },
  actions: {
    flexDirection: 'row',
    gap: 7,
    marginLeft: 10,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
