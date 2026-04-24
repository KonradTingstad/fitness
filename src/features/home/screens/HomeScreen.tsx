import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Clock, Dumbbell, Droplets, Utensils, Wheat } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { addWater } from '@/data/repositories/nutritionRepository';
import { startEmptyWorkout, startWorkoutFromRoutine } from '@/data/repositories/workoutRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { useDashboard, useRoutines } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function CalorieArc({ progress, color, trackColor }: { progress: number; color: string; trackColor: string }) {
  const size = 220;
  const strokeWidth = 16;
  const centerY = size / 2;
  const radius = size / 2 - strokeWidth / 2;
  const arcLength = Math.PI * radius;
  const startX = strokeWidth / 2;
  const endX = size - strokeWidth / 2;
  const path = `M ${startX} ${centerY} A ${radius} ${radius} 0 0 1 ${endX} ${centerY}`;
  const normalized = Math.max(0, Math.min(1, progress));
  const activeLength = normalized * arcLength;

  return (
    <Svg width={size} height={centerY + strokeWidth / 2 + 2}>
      <Path d={path} fill="none" stroke={trackColor} strokeLinecap="round" strokeWidth={strokeWidth} />
      <Path
        d={path}
        fill="none"
        stroke={color}
        strokeDasharray={`${activeLength} ${arcLength}`}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

function getOverviewTitle(displayName?: string | null): string {
  const firstName = displayName?.trim().split(/\s+/)[0] ?? '';
  if (!firstName) {
    return 'Your daily overview';
  }
  const possessive = /s$/i.test(firstName) ? `${firstName}'` : `${firstName}'s`;
  return `${possessive} daily overview`;
}

export function HomeScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const dashboard = useDashboard();
  const routines = useRoutines();

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

  if (dashboard.isLoading || !dashboard.data) {
    return <LoadingState label="Building dashboard" />;
  }

  const data = dashboard.data;
  const calories = data.today.nutrition.calories;
  const calorieRemaining = Math.round(data.goals.calorieTarget - calories);
  const protein = Math.round(data.today.nutrition.proteinG);
  const carbs = Math.round(data.today.nutrition.carbsG);
  const fat = Math.round(data.today.nutrition.fatG);
  const localDate = data.today.localDate;
  const calorieProgress = data.goals.calorieTarget <= 0 ? 0 : Math.min(1, Math.max(0, calories / data.goals.calorieTarget));
  const proteinProgress = data.goals.proteinTargetG <= 0 ? 0 : Math.min(1, Math.max(0, protein / data.goals.proteinTargetG));
  const carbProgress = data.goals.carbTargetG <= 0 ? 0 : Math.min(1, Math.max(0, carbs / data.goals.carbTargetG));
  const fatProgress = data.goals.fatTargetG <= 0 ? 0 : Math.min(1, Math.max(0, fat / data.goals.fatTargetG));
  const overviewTitle = getOverviewTitle(data.userDisplayName);

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
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText style={styles.pageTitle}>{overviewTitle}</AppText>
        </View>
      </View>

      <Card style={styles.summaryCard}>
        <LinearGradient colors={['#1C3A2B', '#153026', '#121A1F']} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.summaryGradient}>
          <View style={styles.calorieMetaRow}>
            <View>
              <AppText style={styles.calorieMetaLabel}>Consumed</AppText>
              <AppText style={styles.calorieMetaValue}>{Math.round(calories)}</AppText>
            </View>
            <View style={styles.calorieMetaRight}>
              <AppText style={styles.calorieMetaLabel}>Target</AppText>
              <AppText style={styles.calorieMetaValue}>{data.goals.calorieTarget}</AppText>
            </View>
          </View>

          <View style={styles.calorieArcWrap}>
            <CalorieArc progress={calorieProgress} color={theme.colors.primary} trackColor="rgba(255,255,255,0.14)" />
            <View style={styles.calorieArcCenter}>
              <AppText style={styles.remainingLabel}>Remaining</AppText>
              <AppText
                style={[
                  styles.remainingValue,
                  { color: calorieRemaining < 0 ? theme.colors.warning : '#EAF9F0' },
                ]}
              >
                {calorieRemaining}
              </AppText>
              <AppText style={styles.remainingUnit}>kcal</AppText>
            </View>
          </View>

          <View style={styles.macroRow}>
            <View style={styles.macroCard}>
              <View style={styles.macroTitleRow}>
                <Dumbbell size={14} color={theme.colors.primary} />
                <AppText style={styles.macroLabel}>Protein</AppText>
              </View>
              <AppText style={styles.macroValue}>
                {protein}/{data.goals.proteinTargetG} g
              </AppText>
              <View style={styles.macroTrack}>
                <View style={[styles.macroFill, { backgroundColor: theme.colors.primary, width: `${proteinProgress * 100}%` }]} />
              </View>
            </View>

            <View style={styles.macroCard}>
              <View style={styles.macroTitleRow}>
                <Wheat size={14} color={theme.colors.info} />
                <AppText style={styles.macroLabel}>Carbs</AppText>
              </View>
              <AppText style={styles.macroValue}>
                {carbs}/{data.goals.carbTargetG} g
              </AppText>
              <View style={styles.macroTrack}>
                <View style={[styles.macroFill, { backgroundColor: theme.colors.info, width: `${carbProgress * 100}%` }]} />
              </View>
            </View>

            <View style={styles.macroCard}>
              <View style={styles.macroTitleRow}>
                <Droplets size={14} color={theme.colors.warning} />
                <AppText style={styles.macroLabel}>Fat</AppText>
              </View>
              <AppText style={styles.macroValue}>
                {fat}/{data.goals.fatTargetG} g
              </AppText>
              <View style={styles.macroTrack}>
                <View style={[styles.macroFill, { backgroundColor: theme.colors.warning, width: `${fatProgress * 100}%` }]} />
              </View>
            </View>
          </View>
        </LinearGradient>
      </Card>

      <View style={styles.actionRow}>
        <Button label="Start workout" icon={Dumbbell} onPress={startAction} style={styles.actionButton} />
        <Button
          label="Log meal"
          icon={Utensils}
          style={styles.actionButton}
          onPress={() => navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate })}
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
                  <AppText variant="small" muted>
                    {todayPlan.time}
                  </AppText>
                  <AppText variant="small" muted>
                    •
                  </AppText>
                  <AppText variant="small" muted>
                    {todayPlan.exerciseCount} exercises
                  </AppText>
                  <AppText variant="small" muted>
                    •
                  </AppText>
                  <AppText variant="small" muted>
                    Est. {todayPlan.estimatedDurationMinutes} min
                  </AppText>
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
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                {todayPlan.actionLabel}
              </AppText>
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                ›
              </AppText>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyState}>
            <AppText weight="800">No workout scheduled</AppText>
            <Button label="Schedule workout" variant="secondary" onPress={() => navigation.navigate('MainTabs', { screen: 'Workouts' })} />
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
            <AppText style={styles.hydrationGoal} muted>
              goal {data.goals.waterTargetMl} ml
            </AppText>
          </View>
          <Pressable
            onPress={() => water.mutate()}
            style={({ pressed }) => [
              styles.hydrationAddButton,
              { borderColor: theme.colors.info, opacity: pressed ? 0.84 : 1 },
            ]}
          >
            <AppText weight="800" style={{ color: theme.colors.info }}>
              Add 250 ml
            </AppText>
          </Pressable>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.colors.info, width: `${waterProgress * 100}%` }]} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  pageSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  summaryCard: {
    overflow: 'hidden',
    padding: 0,
  },
  summaryGradient: {
    gap: 12,
    padding: 14,
  },
  calorieMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calorieMetaRight: {
    alignItems: 'flex-end',
  },
  calorieMetaLabel: {
    color: '#B9C7C2',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  calorieMetaValue: {
    color: '#F1F7F4',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 25,
  },
  calorieArcWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  calorieArcCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 34,
  },
  remainingLabel: {
    color: '#C6D2CE',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  remainingValue: {
    fontSize: 35,
    fontWeight: '800',
    lineHeight: 38,
  },
  remainingUnit: {
    color: '#B9C7C2',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
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
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroCard: {
    borderRadius: 12,
    flex: 1,
    gap: 5,
    minHeight: 76,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 15, 20, 0.38)',
  },
  macroTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    color: '#D5DFDB',
  },
  macroValue: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
    color: '#EFF6F2',
  },
  macroTrack: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    height: 5,
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
});
