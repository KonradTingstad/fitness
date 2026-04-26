import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Droplets, Dumbbell, User, Utensils, Wheat } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { addWater } from '@/data/repositories/nutritionRepository';
import { startEmptyWorkout, startWorkoutFromRoutine } from '@/data/repositories/workoutRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { useDashboard, useRoutines } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HERO_MAX_HEIGHT = 436;
const HERO_MIN_HEIGHT = 112;
const HERO_SCROLL_RANGE = HERO_MAX_HEIGHT - HERO_MIN_HEIGHT;
const HERO_WAVE_PARTICLES = [
  { top: 286, left: 28, size: 3, opacity: 0.22 },
  { top: 304, left: 54, size: 4, opacity: 0.3 },
  { top: 318, left: 92, size: 2, opacity: 0.18 },
  { top: 294, left: 128, size: 3, opacity: 0.24 },
  { top: 324, left: 170, size: 4, opacity: 0.26 },
  { top: 308, left: 214, size: 3, opacity: 0.2 },
  { top: 320, left: 252, size: 5, opacity: 0.28 },
  { top: 296, left: 292, size: 3, opacity: 0.22 },
  { top: 332, left: 326, size: 2, opacity: 0.16 },
  { top: 306, left: 350, size: 4, opacity: 0.24 },
];
const HERO_NOISE_POINTS = [
  { top: 24, left: 38, opacity: 0.07 },
  { top: 42, left: 118, opacity: 0.05 },
  { top: 66, left: 280, opacity: 0.06 },
  { top: 98, left: 210, opacity: 0.05 },
  { top: 124, left: 330, opacity: 0.06 },
  { top: 148, left: 64, opacity: 0.04 },
  { top: 172, left: 258, opacity: 0.06 },
  { top: 198, left: 162, opacity: 0.05 },
  { top: 226, left: 338, opacity: 0.06 },
  { top: 246, left: 90, opacity: 0.04 },
  { top: 270, left: 190, opacity: 0.05 },
  { top: 298, left: 134, opacity: 0.06 },
  { top: 324, left: 284, opacity: 0.04 },
  { top: 346, left: 50, opacity: 0.05 },
];

function CalorieArc({ progress, color, trackColor }: { progress: number; color: string; trackColor: string }) {
  const size = 226;
  const strokeWidth = 12;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const arcCoverage = 0.78;
  const arcLength = circumference * arcCoverage;
  const normalized = Math.max(0, Math.min(1, progress));

  return (
    <Svg width={size} height={size}>
      <G rotation={130} origin={`${center},${center}`}>
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={trackColor}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={color}
          strokeOpacity={0.28}
          strokeWidth={strokeWidth + 3}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={arcLength * (1 - normalized)}
          strokeLinecap="round"
        />
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={arcLength * (1 - normalized)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </G>
    </Svg>
  );
}

function getOverviewTitle(displayName?: string | null): string {
  const firstName = displayName?.trim().split(/\s+/)[0] ?? '';
  if (!firstName) {
    return 'Good morning';
  }
  return `Good morning, ${firstName}.`;
}

export function HomeScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const dashboard = useDashboard();
  const routines = useRoutines();
  const scrollY = useSharedValue(0);

  const startWorkout = useMutation({
    mutationFn: async (routineId?: string) => (routineId ? startWorkoutFromRoutine(routineId) : startEmptyWorkout()),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      navigation.navigate('LiveWorkout', { sessionId });
    },
  });

  const water = useMutation({
    mutationFn: () => addWater(250, toLocalDateKey()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(toLocalDateKey()) });
    },
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = Math.max(0, event.contentOffset.y);
    },
  });

  const heroContainerStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [HERO_MAX_HEIGHT, HERO_MIN_HEIGHT], Extrapolation.CLAMP),
  }));

  const heroBackgroundStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -HERO_SCROLL_RANGE * 0.44], Extrapolation.CLAMP),
      },
    ],
  }));

  const heroBlobNearStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -HERO_SCROLL_RANGE * 0.24], Extrapolation.CLAMP) },
      { translateX: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, 14], Extrapolation.CLAMP) },
    ],
  }));

  const heroBlobFarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -HERO_SCROLL_RANGE * 0.58], Extrapolation.CLAMP) }],
    opacity: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0.9, 0.66], Extrapolation.CLAMP),
  }));

  const heroWaveStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -HERO_SCROLL_RANGE * 0.14], Extrapolation.CLAMP) }],
    opacity: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [1, 0.82], Extrapolation.CLAMP),
  }));

  const heroParticleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -HERO_SCROLL_RANGE * 0.2], Extrapolation.CLAMP) }],
    opacity: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [1, 0.78], Extrapolation.CLAMP),
  }));

  const heroCopyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 170], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 170], [0, -10], Extrapolation.CLAMP) }],
  }));

  const heroExpandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 180], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [0, -26], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, HERO_SCROLL_RANGE], [1, 0.76], Extrapolation.CLAMP) },
    ],
  }));

  if (dashboard.isLoading || !dashboard.data) {
    return <LoadingState label="Building dashboard" />;
  }

  const data = dashboard.data;
  const calories = Math.round(data.today.nutrition.calories);
  const targetCalories = Math.round(data.goals.calorieTarget);
  const calorieRemaining = targetCalories - calories;

  const protein = Math.round(data.today.nutrition.proteinG);
  const carbs = Math.round(data.today.nutrition.carbsG);
  const fat = Math.round(data.today.nutrition.fatG);

  const proteinTarget = Math.round(data.goals.proteinTargetG);
  const carbTarget = Math.round(data.goals.carbTargetG);
  const fatTarget = Math.round(data.goals.fatTargetG);

  const localDate = data.today.localDate;
  const calorieProgress = targetCalories <= 0 ? 0 : Math.min(1, Math.max(0, calories / targetCalories));
  const proteinProgress = proteinTarget <= 0 ? 0 : Math.min(1, Math.max(0, protein / proteinTarget));
  const carbProgress = carbTarget <= 0 ? 0 : Math.min(1, Math.max(0, carbs / carbTarget));
  const fatProgress = fatTarget <= 0 ? 0 : Math.min(1, Math.max(0, fat / fatTarget));
  const headerTitle = getOverviewTitle(data.userDisplayName);

  const openPlan = () => {
    if (!data.todayPlan) {
      return;
    }
    if (data.todayPlan.action === 'start') {
      startWorkout.mutate(data.todayPlan.routineId);
      return;
    }
    if (!data.todayPlan.sessionId) {
      return;
    }
    if (data.todayPlan.action === 'view_summary') {
      navigation.navigate('WorkoutSummary', { sessionId: data.todayPlan.sessionId });
      return;
    }
    navigation.navigate('LiveWorkout', { sessionId: data.todayPlan.sessionId });
  };

  const startAction = () => {
    if (data.todayPlan?.action === 'view_workout' && data.todayPlan.sessionId) {
      navigation.navigate('LiveWorkout', { sessionId: data.todayPlan.sessionId });
      return;
    }
    startWorkout.mutate(data.todayPlan?.routineId ?? routines.data?.[0]?.id);
  };

  const fallbackRoutine = routines.data?.[0];
  const todayPlan = data.todayPlan
    ? {
        workoutName: data.todayPlan.workoutName,
        time: data.todayPlan.time ?? '18:00',
        exerciseCount: data.todayPlan.exerciseCount,
        estimatedDurationMinutes: data.todayPlan.estimatedDurationMinutes,
        actionLabel: data.todayPlan.action === 'start' ? 'Start workout' : 'View workout',
        onPress: openPlan,
      }
    : fallbackRoutine
      ? {
          workoutName: fallbackRoutine.name,
          time: '18:00',
          exerciseCount: fallbackRoutine.exercises.length,
          estimatedDurationMinutes: Math.max(30, fallbackRoutine.exercises.length * 12),
          actionLabel: 'Start workout',
          onPress: () => startWorkout.mutate(fallbackRoutine.id),
        }
      : null;

  const waterProgress = data.goals.waterTargetMl <= 0 ? 0 : Math.min(1, Math.max(0, data.today.waterMl / data.goals.waterTargetMl));

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[styles.heroLayer, heroContainerStyle]}>
          <Animated.View style={[styles.heroBackground, heroBackgroundStyle]}>
            <LinearGradient
              colors={['#1ED760', '#0F3D2E', theme.colors.background]}
              end={{ x: 0.5, y: 1 }}
              start={{ x: 0.5, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(168,255,209,0.08)', 'rgba(21,67,52,0.14)', 'rgba(2,6,23,0)']}
              end={{ x: 0.92, y: 0.86 }}
              start={{ x: 0.12, y: 0.04 }}
              style={styles.heroDepthLayer}
            />
            <Animated.View style={[styles.heroBlobNear, heroBlobNearStyle]} />
            <Animated.View style={[styles.heroBlobFar, heroBlobFarStyle]} />
            <Animated.View style={[styles.heroBlobEdge, heroBlobFarStyle]} />
            <Animated.View style={[styles.heroWaveField, heroWaveStyle]}>
              <LinearGradient
                colors={['rgba(30,215,96,0)', 'rgba(30,215,96,0.3)', 'rgba(30,215,96,0.12)', 'rgba(2,6,23,0)']}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0.08 }}
                style={styles.heroWaveMain}
              />
              <LinearGradient
                colors={['rgba(30,215,96,0)', 'rgba(106,255,174,0.24)', 'rgba(30,215,96,0)']}
                end={{ x: 1, y: 0.7 }}
                start={{ x: 0, y: 0.3 }}
                style={styles.heroWaveMeshA}
              />
              <LinearGradient
                colors={['rgba(30,215,96,0)', 'rgba(102,255,170,0.2)', 'rgba(30,215,96,0)']}
                end={{ x: 1, y: 0.62 }}
                start={{ x: 0, y: 0.4 }}
                style={styles.heroWaveMeshB}
              />
              <LinearGradient
                colors={['rgba(30,215,96,0)', 'rgba(146,255,196,0.16)', 'rgba(30,215,96,0)']}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={styles.heroWaveMeshC}
              />
            </Animated.View>
            <Animated.View style={[styles.heroParticleLayer, heroParticleStyle]}>
              {HERO_WAVE_PARTICLES.map((particle, index) => (
                <View
                  key={`hero-particle-${index}`}
                  style={[
                    styles.heroParticle,
                    {
                      top: particle.top,
                      left: particle.left,
                      width: particle.size,
                      height: particle.size,
                      opacity: particle.opacity,
                    },
                  ]}
                />
              ))}
            </Animated.View>
            <Animated.View style={[styles.heroNoiseLayer, heroBlobFarStyle]}>
              {HERO_NOISE_POINTS.map((point, index) => (
                <View
                  key={`hero-noise-${index}`}
                  style={[styles.heroNoiseDot, { top: point.top, left: point.left, opacity: point.opacity }]}
                />
              ))}
            </Animated.View>
            <LinearGradient
              colors={['rgba(17,20,24,0)', 'rgba(17,20,24,0.46)', theme.colors.background]}
              locations={[0, 0.58, 1]}
              style={styles.heroFadeBottom}
            />
          </Animated.View>

          <Animated.View style={[styles.heroCopyWrap, { top: insets.top + 36 }, heroCopyStyle]}>
            <AppText style={styles.heroTitle}>{headerTitle}</AppText>
            <AppText style={styles.heroSubtitle}>Let&apos;s crush your goals today.</AppText>
          </Animated.View>

          <Animated.View style={[styles.heroExpanded, { top: insets.top + 102 }, heroExpandedStyle]}>
            <View style={[styles.sideStat, styles.sideStatLeft]}>
              <AppText style={styles.sideLabel}>Consumed</AppText>
              <AppText style={[styles.sideValue, { color: theme.colors.primary }]}>{calories}</AppText>
              <AppText style={styles.sideUnit}>kcal</AppText>
            </View>

            <View style={styles.ringWrap}>
              <View style={styles.ringAuraOuter} />
              <View style={styles.ringAuraInner} />
              <CalorieArc progress={calorieProgress} color={theme.colors.primary} trackColor="rgba(235,255,244,0.5)" />
              <View style={styles.ringCenter}>
                <AppText style={styles.centerLabel}>Remaining kcal</AppText>
                <AppText style={[styles.centerValue, { color: calorieRemaining < 0 ? theme.colors.warning : '#F0F8F3' }]}>
                  {calorieRemaining}
                </AppText>
                <AppText style={styles.centerGoal}>Goal {targetCalories} kcal</AppText>
              </View>
            </View>

            <View style={[styles.sideStat, styles.sideStatRight]}>
              <AppText style={styles.sideLabel}>Target</AppText>
              <AppText style={styles.sideValue}>{targetCalories}</AppText>
              <AppText style={styles.sideUnit}>kcal</AppText>
            </View>
          </Animated.View>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('ProfileSettings')}
          style={({ pressed }) => [
            styles.profileButton,
            {
              top: insets.top + 10,
              opacity: pressed ? 0.84 : 1,
              borderColor: 'rgba(255,255,255,0.2)',
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.08)', 'rgba(6,10,14,0.44)']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <User size={17} color="#ECF7EF" strokeWidth={2.4} />
        </Pressable>

        <Animated.ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: HERO_MAX_HEIGHT - 26,
              paddingHorizontal: theme.spacing(4),
              paddingBottom: 120,
            },
          ]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentStack}>
            <View style={styles.macroRow}>
              <View style={styles.macroCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.01)']}
                  end={{ x: 0.94, y: 0.94 }}
                  start={{ x: 0.03, y: 0.04 }}
                  style={styles.macroGlass}
                />
                <View style={styles.macroCardBody}>
                  <View style={styles.macroTitleRow}>
                    <Dumbbell size={14} color={theme.colors.primary} />
                    <AppText style={styles.macroTitle}>Protein</AppText>
                  </View>
                  <AppText style={styles.macroValue}>{protein} / {proteinTarget} g</AppText>
                  <View style={styles.macroTrack}>
                    <View style={[styles.macroFill, { width: `${proteinProgress * 100}%`, backgroundColor: theme.colors.primary }]} />
                  </View>
                </View>
              </View>

              <View style={styles.macroCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.01)']}
                  end={{ x: 0.94, y: 0.94 }}
                  start={{ x: 0.03, y: 0.04 }}
                  style={styles.macroGlass}
                />
                <View style={styles.macroCardBody}>
                  <View style={styles.macroTitleRow}>
                    <Wheat size={14} color={theme.colors.info} />
                    <AppText style={styles.macroTitle}>Carbs</AppText>
                  </View>
                  <AppText style={styles.macroValue}>{carbs} / {carbTarget} g</AppText>
                  <View style={styles.macroTrack}>
                    <View style={[styles.macroFill, { width: `${carbProgress * 100}%`, backgroundColor: theme.colors.info }]} />
                  </View>
                </View>
              </View>

              <View style={styles.macroCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.01)']}
                  end={{ x: 0.94, y: 0.94 }}
                  start={{ x: 0.03, y: 0.04 }}
                  style={styles.macroGlass}
                />
                <View style={styles.macroCardBody}>
                  <View style={styles.macroTitleRow}>
                    <Droplets size={14} color={theme.colors.warning} />
                    <AppText style={styles.macroTitle}>Fat</AppText>
                  </View>
                  <AppText style={styles.macroValue}>{fat} / {fatTarget} g</AppText>
                  <View style={styles.macroTrack}>
                    <View style={[styles.macroFill, { width: `${fatProgress * 100}%`, backgroundColor: theme.colors.warning }]} />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Button label="Start workout" icon={Dumbbell} onPress={startAction} style={styles.actionButton} />
              <Button
                label="Log meal"
                icon={Utensils}
                onPress={() => navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate })}
                style={styles.actionButton}
              />
            </View>

            <Card style={styles.planCard}>
              <AppText style={styles.sectionTitle}>Today&apos;s plan</AppText>
              {todayPlan ? (
                <>
                  <View style={styles.planContentRow}>
                    <View style={[styles.planIconWrap, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                      <Dumbbell size={20} color={theme.colors.primary} />
                    </View>
                    <View style={styles.planCopy}>
                      <AppText style={styles.planName}>{todayPlan.workoutName}</AppText>
                      <View style={styles.planMetaRow}>
                        <Clock size={14} color={theme.colors.muted} />
                        <AppText muted variant="small">{todayPlan.time}</AppText>
                        <AppText muted variant="small">•</AppText>
                        <AppText muted variant="small">{todayPlan.exerciseCount} exercises</AppText>
                        <AppText muted variant="small">•</AppText>
                        <AppText muted variant="small">Est. {todayPlan.estimatedDurationMinutes} min</AppText>
                      </View>
                    </View>
                  </View>

                  <Pressable
                    onPress={todayPlan.onPress}
                    style={({ pressed }) => [
                      styles.planAction,
                      { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
                    ]}
                  >
                    <AppText style={{ color: theme.colors.primary }} weight="800">{todayPlan.actionLabel}</AppText>
                    <AppText style={{ color: theme.colors.primary }} weight="800">›</AppText>
                  </Pressable>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <AppText weight="800">No workout scheduled</AppText>
                  <Button
                    label="Schedule workout"
                    onPress={() => navigation.navigate('MainTabs', { screen: 'Workouts' })}
                    variant="secondary"
                  />
                </View>
              )}
            </Card>

            <Card style={styles.hydrationCard}>
              <View style={styles.hydrationHeader}>
                <AppText style={styles.sectionTitle}>Hydration</AppText>
              </View>
              <View style={styles.hydrationTopRow}>
                <View>
                  <AppText style={[styles.hydrationValue, { color: theme.colors.info }]}>{Math.round(data.today.waterMl)} ml</AppText>
                  <AppText muted style={styles.hydrationGoal}>goal {Math.round(data.goals.waterTargetMl)} ml</AppText>
                </View>
                <Pressable
                  onPress={() => water.mutate()}
                  style={({ pressed }) => [
                    styles.hydrationAddButton,
                    { borderColor: theme.colors.info, opacity: pressed ? 0.84 : 1 },
                  ]}
                >
                  <AppText style={{ color: theme.colors.info }} weight="800">Add 250 ml</AppText>
                </Pressable>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                <View style={[styles.progressFill, { width: `${waterProgress * 100}%`, backgroundColor: theme.colors.info }]} />
              </View>
            </Card>
          </View>
        </Animated.ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  profileButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,16,22,0.46)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 5,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    width: 42,
    zIndex: 5,
  },
  heroLayer: {
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  heroDepthLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBlobNear: {
    backgroundColor: 'rgba(30,215,96,0.22)',
    borderRadius: 360,
    height: 360,
    left: -128,
    position: 'absolute',
    shadowColor: '#1ED760',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 86,
    top: -138,
    width: 360,
  },
  heroBlobFar: {
    backgroundColor: 'rgba(17,117,72,0.16)',
    borderRadius: 320,
    height: 320,
    position: 'absolute',
    right: -104,
    shadowColor: '#1CB664',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 72,
    top: 52,
    width: 320,
  },
  heroBlobEdge: {
    backgroundColor: 'rgba(20,92,67,0.1)',
    borderRadius: 250,
    bottom: -48,
    height: 250,
    position: 'absolute',
    right: 78,
    shadowColor: '#18A95F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 58,
    width: 250,
  },
  heroWaveField: {
    bottom: 16,
    height: 176,
    left: -44,
    position: 'absolute',
    right: -44,
  },
  heroWaveMain: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 170,
  },
  heroWaveMeshA: {
    borderRadius: 160,
    height: 84,
    left: -12,
    opacity: 0.86,
    position: 'absolute',
    right: -12,
    top: 58,
    transform: [{ rotate: '-4deg' }],
  },
  heroWaveMeshB: {
    borderRadius: 160,
    height: 70,
    left: -20,
    opacity: 0.72,
    position: 'absolute',
    right: -20,
    top: 90,
    transform: [{ rotate: '3deg' }],
  },
  heroWaveMeshC: {
    borderRadius: 160,
    height: 64,
    left: -8,
    opacity: 0.6,
    position: 'absolute',
    right: -8,
    top: 118,
    transform: [{ rotate: '-2deg' }],
  },
  heroParticleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroParticle: {
    backgroundColor: '#6FFFBA',
    borderRadius: 999,
    position: 'absolute',
    shadowColor: '#66FFB4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.58,
    shadowRadius: 9,
  },
  heroNoiseLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroNoiseDot: {
    backgroundColor: '#D6FFE7',
    borderRadius: 999,
    height: 2,
    position: 'absolute',
    width: 2,
  },
  heroFadeBottom: {
    bottom: 0,
    height: 260,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  heroCopyWrap: {
    left: 20,
    position: 'absolute',
    right: 20,
    top: 16,
  },
  heroTitle: {
    color: '#F2FCF7',
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 31,
  },
  heroSubtitle: {
    color: '#B5C8BE',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 4,
  },
  heroExpanded: {
    left: 0,
    minHeight: 270,
    position: 'absolute',
    right: 0,
    top: 124,
  },
  sideStat: {
    gap: 0,
    position: 'absolute',
    top: 102,
  },
  sideStatLeft: {
    left: 8,
  },
  sideStatRight: {
    alignItems: 'flex-end',
    right: 8,
  },
  sideLabel: {
    color: '#B9CBC2',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  sideValue: {
    color: '#F0F7F3',
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 25,
    marginTop: 2,
  },
  sideUnit: {
    color: '#AFC2B9',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 10,
    marginTop: 1,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 252,
    position: 'relative',
  },
  ringAuraOuter: {
    backgroundColor: 'rgba(92,243,157,0.08)',
    borderRadius: 999,
    height: 256,
    position: 'absolute',
    width: 256,
  },
  ringAuraInner: {
    backgroundColor: 'rgba(71,232,146,0.08)',
    borderRadius: 999,
    elevation: 2,
    height: 232,
    position: 'absolute',
    shadowColor: '#4CE694',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    width: 232,
  },
  ringCenter: {
    alignItems: 'center',
    position: 'absolute',
    top: 78,
  },
  centerLabel: {
    color: '#D5E7DE',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.35,
    lineHeight: 12,
  },
  centerValue: {
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 50,
    marginTop: 3,
  },
  centerGoal: {
    color: '#B3C5BD',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
    marginTop: 1,
  },
  scrollContent: {
    gap: 12,
  },
  contentStack: {
    gap: 12,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -20,
    zIndex: 2,
  },
  macroCard: {
    backgroundColor: 'rgba(8,18,26,0.38)',
    borderRadius: 16,
    elevation: 4,
    flex: 1,
    minHeight: 88,
    overflow: 'hidden',
    shadowColor: '#39DE8E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  macroGlass: {
    ...StyleSheet.absoluteFillObject,
  },
  macroCardBody: {
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  macroTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  macroTitle: {
    color: '#D7E9DF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  macroValue: {
    color: '#F2FAF6',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  macroTrack: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
  },
  macroFill: {
    borderRadius: 999,
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    borderRadius: 14,
    flex: 1,
    minHeight: 54,
  },
  planCard: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  planContentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  planIconWrap: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  planCopy: {
    flex: 1,
    gap: 4,
  },
  planName: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  planMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  planAction: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  emptyState: {
    gap: 10,
  },
  hydrationCard: {
    gap: 10,
  },
  hydrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hydrationTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hydrationValue: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  hydrationGoal: {
    fontSize: 11,
    lineHeight: 14,
  },
  hydrationAddButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    minWidth: 148,
    paddingHorizontal: 14,
  },
  progressTrack: {
    borderRadius: 8,
    height: 14,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 8,
    height: '100%',
  },
});
