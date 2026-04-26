import { useFocusEffect } from '@react-navigation/native';
import { ComponentType, PropsWithChildren, useCallback, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { LucideProps } from 'lucide-react-native';
import { Pressable, ScrollView, ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

type NutritionButtonVariant = 'primary' | 'soft' | 'ghost';

interface NutritionScreenProps extends PropsWithChildren {
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'onScroll' | 'scrollEventThrottle'>;
  resetScrollOnBlur?: boolean;
}

interface NutritionCardProps extends PropsWithChildren {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

interface NutritionButtonProps {
  label: string;
  onPress: () => void;
  icon?: ComponentType<LucideProps>;
  variant?: NutritionButtonVariant;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

const CARD_COLORS = ['rgba(30,36,44,0.96)', 'rgba(21,27,34,0.92)', 'rgba(18,23,29,0.96)'] as const;
const SOFT_BUTTON_COLORS = ['rgba(42,51,62,0.96)', 'rgba(30,37,46,0.93)'] as const;
const PRIMARY_BUTTON_COLORS = ['rgba(58,207,127,1)', 'rgba(25,180,96,1)'] as const;
const GHOST_BUTTON_COLORS = ['rgba(31,39,48,0.48)', 'rgba(24,30,37,0.38)'] as const;

function cardOuterStyle(style?: StyleProp<ViewStyle>): ViewStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  return {
    alignSelf: flat.alignSelf,
    flex: flat.flex,
    flexBasis: flat.flexBasis,
    flexGrow: flat.flexGrow,
    flexShrink: flat.flexShrink,
    height: flat.height,
    margin: flat.margin,
    marginBottom: flat.marginBottom,
    marginEnd: flat.marginEnd,
    marginHorizontal: flat.marginHorizontal,
    marginLeft: flat.marginLeft,
    marginRight: flat.marginRight,
    marginStart: flat.marginStart,
    marginTop: flat.marginTop,
    marginVertical: flat.marginVertical,
    maxHeight: flat.maxHeight,
    maxWidth: flat.maxWidth,
    minHeight: flat.minHeight,
    minWidth: flat.minWidth,
    width: flat.width,
  };
}

export function NutritionScreen({ children, contentContainerStyle, scrollProps, resetScrollOnBlur = false }: NutritionScreenProps) {
  const theme = useAppTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!resetScrollOnBlur) {
          return;
        }
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        scrollY.value = 0;
      };
    }, [resetScrollOnBlur, scrollY]),
  );

  const nearLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 260], [1, 0.82], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 320], [0, -34], Extrapolation.CLAMP) }],
  }));
  const farLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 300], [0.86, 0.62], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 320], [0, -18], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Animated.View pointerEvents="none" style={[styles.backgroundLayer, farLayerStyle]}>
        <LinearGradient
          colors={[
            'rgba(38,211,121,0.5)',
            'rgba(28,160,91,0.32)',
            'rgba(17,89,60,0.18)',
            'rgba(17,20,24,0.02)',
            'rgba(17,20,24,0)',
          ]}
          end={{ x: 0.56, y: 1 }}
          locations={[0, 0.28, 0.54, 0.84, 1]}
          start={{ x: 0.42, y: 0 }}
          style={styles.fullFade}
        />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.backgroundLayer, nearLayerStyle]}>
        <LinearGradient
          colors={['rgba(173,255,211,0.12)', 'rgba(47,211,122,0.16)', 'rgba(20,95,64,0.08)', 'rgba(17,20,24,0)']}
          end={{ x: 1, y: 0.76 }}
          locations={[0, 0.34, 0.68, 1]}
          start={{ x: 0, y: 0.04 }}
          style={styles.fullFade}
        />
        <View style={styles.backgroundGlow} />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          ref={scrollViewRef}
          {...scrollProps}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {children}
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

export function NutritionCard({ children, onPress, style }: NutritionCardProps) {
  const outerStyle = cardOuterStyle(style);
  const fill = (
    <LinearGradient colors={CARD_COLORS} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={[styles.cardFill, style]}>
      {children}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cardShadow, outerStyle, pressed && { opacity: 0.9, transform: [{ scale: 0.988 }] }]}
      >
        {fill}
      </Pressable>
    );
  }

  return (
    <View style={[styles.cardShadow, outerStyle]}>
      {fill}
    </View>
  );
}

export function NutritionButton({ label, onPress, icon: Icon, variant = 'primary', style, disabled }: NutritionButtonProps) {
  const theme = useAppTheme();
  const colors = variant === 'primary' ? PRIMARY_BUTTON_COLORS : variant === 'soft' ? SOFT_BUTTON_COLORS : GHOST_BUTTON_COLORS;
  const textColor = variant === 'primary' ? '#08100C' : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.buttonShadow, disabled && { opacity: 0.5 }, pressed && !disabled && { opacity: 0.86 }, style]}
    >
      <LinearGradient colors={colors} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.buttonFill}>
        {Icon ? <Icon size={17} color={textColor} strokeWidth={2.5} /> : null}
        <AppText style={{ color: textColor }} weight="800">
          {label}
        </AppText>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  fullFade: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundGlow: {
    backgroundColor: 'rgba(60,220,135,0.12)',
    borderRadius: 180,
    height: 260,
    position: 'absolute',
    right: -96,
    top: 92,
    width: 260,
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 28,
  },
  cardShadow: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  cardFill: {
    borderRadius: 12,
    gap: 8,
    overflow: 'hidden',
    padding: 12,
  },
  buttonShadow: {
    borderRadius: 11,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  buttonFill: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
});
