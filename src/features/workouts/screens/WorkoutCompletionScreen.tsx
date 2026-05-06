import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Share2, Star, X, Clock3, Weight, Trophy } from 'lucide-react-native';
import { ReactNode, useMemo } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { LoadingState } from '@/components/LoadingState';
import { calculateWorkoutVolume, estimatedOneRepMax } from '@/domain/calculations/workout';
import { WorkoutExercise, WorkoutSet } from '@/domain/models';
import { useCompletedWorkoutCount, useWorkoutSession } from '@/hooks/useAppQueries';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'WorkoutCompletion'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ExerciseSummaryRow {
  id: string;
  exerciseLabel: string;
  bestSetLabel: string;
}

export function WorkoutCompletionScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const session = useWorkoutSession(route.params.sessionId);
  const completedCount = useCompletedWorkoutCount();

  const summary = useMemo(() => {
    if (!session.data) {
      return null;
    }

    const completedSets = session.data.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted);
    const durationSeconds = Math.max(
      0,
      Math.round(
        ((session.data.endedAt ? new Date(session.data.endedAt) : new Date()).getTime() - new Date(session.data.startedAt).getTime()) / 1000,
      ),
    );
    const totalVolumeKg = calculateWorkoutVolume(completedSets);
    const prCount = completedSets.filter(
      (set) => (set.weightKg ?? 0) > (set.previousWeightKg ?? 0) && (set.reps ?? 0) >= (set.previousReps ?? 0),
    ).length;

    const rows = session.data.exercises
      .map((exercise) => buildExerciseSummaryRow(exercise))
      .filter((row): row is ExerciseSummaryRow => Boolean(row));

    return {
      title: session.data.title,
      dateLabel: formatWorkoutDate(session.data.startedAt),
      durationLabel: formatDuration(durationSeconds),
      volumeLabel: `${formatLoad(totalVolumeKg)} kg`,
      prLabel: `${prCount} PR${prCount === 1 ? '' : 's'}`,
      rows,
      prCount,
      durationSeconds,
      totalVolumeKg,
    };
  }, [session.data]);

  const completionMessage = useMemo(() => {
    const count = completedCount.data;
    if (!Number.isFinite(count) || !count || count < 1) {
      return 'Workout completed!';
    }
    return `That's your ${ordinal(count)} workout!`;
  }, [completedCount.data]);

  const shareMessage = useMemo(() => {
    if (!summary) {
      return 'Workout completed!';
    }
    const topRows = summary.rows.slice(0, 6).map((row) => `${row.exerciseLabel} — ${row.bestSetLabel}`);
    return [
      `${summary.title} • ${summary.dateLabel}`,
      `${summary.durationLabel} • ${summary.volumeLabel} • ${summary.prLabel}`,
      topRows.length ? '' : undefined,
      ...topRows,
    ]
      .filter(Boolean)
      .join('\n');
  }, [summary]);

  const closeScreen = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch {
      Alert.alert('Share unavailable', 'Could not open the share sheet right now.');
    }
  };

  if (session.isLoading || !summary) {
    return <LoadingState label="Preparing workout recap" />;
  }

  return (
    <View style={[styles.root, { backgroundColor: '#0E1218' }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={closeScreen}
              style={({ pressed }) => [styles.headerButton, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <X size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.headerButton, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <Share2 size={17} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.celebrationWrap}>
            <View style={styles.starRow}>
              <Star size={16} color="#F6CC63" fill="#F6CC63" />
              <Star size={24} color="#F6CC63" fill="#F6CC63" />
              <Star size={16} color="#F6CC63" fill="#F6CC63" />
            </View>
            <AppText variant="hero" weight="800" style={styles.congratsTitle}>
              Congratulations!
            </AppText>
            <AppText muted style={styles.congratsSubtitle}>
              {completionMessage}
            </AppText>
          </View>

          <View style={[styles.summaryCard, { borderColor: theme.colors.border, backgroundColor: 'rgba(21,27,35,0.96)' }]}>
            <AppText variant="title" weight="800" numberOfLines={1}>
              {summary.title}
            </AppText>
            <AppText muted style={styles.dateLabel}>
              {summary.dateLabel}
            </AppText>

            <View style={styles.metricsRow}>
              <MetricPill icon={<Clock3 size={14} color={theme.colors.muted} />} label={summary.durationLabel} />
              <MetricPill icon={<Weight size={14} color={theme.colors.muted} />} label={summary.volumeLabel} />
              <MetricPill icon={<Trophy size={14} color={theme.colors.warning} />} label={summary.prLabel} />
            </View>

            <View style={[styles.tableHeader, { borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
              <AppText muted variant="small" weight="700" style={styles.exerciseCol}>
                Exercise
              </AppText>
              <AppText muted variant="small" weight="700" style={styles.bestSetCol}>
                Best Set
              </AppText>
            </View>

            {summary.rows.length ? (
              summary.rows.map((row) => (
                <View key={row.id} style={[styles.tableRow, { borderBottomColor: 'rgba(160,174,192,0.12)' }]}>
                  <AppText numberOfLines={1} style={styles.exerciseCol}>
                    {row.exerciseLabel}
                  </AppText>
                  <AppText numberOfLines={1} style={styles.bestSetCol}>
                    {row.bestSetLabel}
                  </AppText>
                </View>
              ))
            ) : (
              <View style={styles.emptyRows}>
                <AppText muted>No completed sets recorded.</AppText>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function MetricPill({ icon, label }: { icon: ReactNode; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metricPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
      {icon}
      <AppText weight="700" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function buildExerciseSummaryRow(exercise: WorkoutExercise): ExerciseSummaryRow | null {
  const completedSets = exercise.sets.filter((set) => set.isCompleted);
  if (!completedSets.length) {
    return null;
  }

  const bestSet = completedSets.reduce((best, set) => {
    if (!best) {
      return set;
    }
    const setScore = estimatedOneRepMax(set.weightKg ?? 0, set.reps ?? 0);
    const bestScore = estimatedOneRepMax(best.weightKg ?? 0, best.reps ?? 0);
    if (setScore !== bestScore) {
      return setScore > bestScore ? set : best;
    }
    const setVolume = (set.weightKg ?? 0) * (set.reps ?? 0);
    const bestVolume = (best.weightKg ?? 0) * (best.reps ?? 0);
    if (setVolume !== bestVolume) {
      return setVolume > bestVolume ? set : best;
    }
    if ((set.reps ?? 0) !== (best.reps ?? 0)) {
      return (set.reps ?? 0) > (best.reps ?? 0) ? set : best;
    }
    return (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best;
  }, completedSets[0]);

  return {
    id: exercise.id,
    exerciseLabel: `${completedSets.length} × ${exercise.exercise?.name ?? 'Exercise'}`,
    bestSetLabel: formatBestSet(bestSet),
  };
}

function formatBestSet(set?: WorkoutSet | null): string {
  if (!set) {
    return '--';
  }
  const weight = set.weightKg ?? null;
  const reps = set.reps ?? null;
  const rpe = set.rpe ?? null;

  if ((weight ?? 0) > 0 && (reps ?? 0) > 0) {
    const withRpe = rpe != null ? ` @ ${formatLoad(rpe)}` : '';
    return `${formatLoad(weight ?? 0)} kg × ${reps}${withRpe}`;
  }
  if ((reps ?? 0) > 0) {
    const withRpe = rpe != null ? ` @ ${formatLoad(rpe)}` : '';
    return `${reps} reps${withRpe}`;
  }
  if ((weight ?? 0) > 0) {
    return `${formatLoad(weight ?? 0)} kg`;
  }
  if ((set.durationSeconds ?? 0) > 0) {
    return formatDuration(set.durationSeconds ?? 0);
  }
  if ((set.distanceMeters ?? 0) > 0) {
    return `${Math.round(set.distanceMeters ?? 0)} m`;
  }
  return '--';
}

function formatLoad(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatWorkoutDate(startedAtIso: string): string {
  return new Date(startedAtIso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function ordinal(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(26,33,42,0.95)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  celebrationWrap: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
    paddingTop: 24,
  },
  starRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  congratsTitle: {
    fontSize: 33,
    lineHeight: 38,
    textAlign: 'center',
  },
  congratsSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  dateLabel: {
    marginTop: -4,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricPill: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
  },
  tableHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 32,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  exerciseCol: {
    flex: 1,
    paddingRight: 12,
  },
  bestSetCol: {
    textAlign: 'right',
    width: 138,
  },
  emptyRows: {
    alignItems: 'center',
    minHeight: 72,
    justifyContent: 'center',
  },
});
