import { useQuery } from '@tanstack/react-query';
import { Clock, Pencil, Trophy, Weight, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { getWorkoutSession } from '@/data/repositories/workoutRepository';
import { calculateWorkoutVolume, estimatedOneRepMax } from '@/domain/calculations/workout';
import { SetType, WorkoutSet } from '@/domain/models';
import { queryKeys } from '@/hooks/queryKeys';
import { useAppTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  sessionId: string | null;
  onClose: () => void;
  onEdit: (sessionId: string) => void;
}

export function CompletedWorkoutDetailsModal({ visible, sessionId, onClose, onEdit }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  const session = useQuery({
    queryKey: sessionId ? queryKeys.workout(sessionId) : (['workout', 'modal-preview'] as const),
    queryFn: () => getWorkoutSession(sessionId as string),
    enabled: visible && Boolean(sessionId),
  });

  const metrics = useMemo(() => {
    if (!session.data) {
      return {
        duration: '--',
        volumeKg: 0,
        prs: 0,
      };
    }

    const allSets = session.data.exercises.flatMap((exercise) => exercise.sets);
    const completedSets = allSets.filter((set) => set.isCompleted);
    const endedAt = session.data.endedAt ? new Date(session.data.endedAt) : new Date();
    const diffMs = endedAt.getTime() - new Date(session.data.startedAt).getTime();
    const prs = completedSets.filter(
      (set) => (set.weightKg ?? 0) > (set.previousWeightKg ?? 0) && (set.reps ?? 0) >= (set.previousReps ?? 0),
    ).length;

    return {
      duration: formatDuration(diffMs),
      volumeKg: Math.round(calculateWorkoutVolume(completedSets)),
      prs,
    };
  }, [session.data]);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              borderColor: theme.colors.border,
              backgroundColor: 'rgba(9,13,19,0.98)',
              marginTop: Math.max(16, insets.top + 10),
              paddingBottom: Math.max(14, insets.bottom + 10),
            },
          ]}
        >
          <View style={[styles.headerRow, { borderBottomColor: theme.colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close workout details"
              onPress={onClose}
              style={({ pressed }) => [
                styles.headerAction,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <X size={16} color={theme.colors.text} />
            </Pressable>

            <AppText variant="section" weight="800" numberOfLines={1} style={styles.headerTitle}>
              {session.data?.title ?? 'Workout'}
            </AppText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit workout"
              disabled={!sessionId}
              onPress={() => {
                if (sessionId) {
                  onEdit(sessionId);
                }
              }}
              style={({ pressed }) => [
                styles.editAction,
                {
                  borderColor: 'rgba(53,199,122,0.34)',
                  backgroundColor: 'rgba(53,199,122,0.12)',
                  opacity: !sessionId ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Pencil size={13} color={theme.colors.primary} />
              <AppText variant="small" weight="700" style={{ color: theme.colors.primary }}>
                Edit
              </AppText>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {session.isLoading ? (
              <AppText muted>Loading workout…</AppText>
            ) : session.isError || !session.data ? (
              <AppText muted>
                {session.error instanceof Error ? session.error.message : 'Could not load workout details.'}
              </AppText>
            ) : (
              <>
                <View style={styles.metaBlock}>
                  <AppText muted style={styles.startedAtText}>
                    {formatStartedAtLabel(session.data.startedAt)}
                  </AppText>

                  <View style={styles.metricsRow}>
                    <MetricItem icon={Clock} value={metrics.duration} />
                    <MetricItem icon={Weight} value={`${metrics.volumeKg.toLocaleString()} kg`} />
                    <MetricItem icon={Trophy} value={`${metrics.prs} PRs`} />
                  </View>
                </View>

                <View style={styles.exerciseList}>
                  {session.data.exercises.length ? (
                    session.data.exercises.map((exercise) => {
                      const showOneRm = exercise.sets.some((set) => getOneRepMax(set) != null);
                      return (
                        <View key={exercise.id} style={[styles.exerciseBlock, { borderBottomColor: theme.colors.border }]}>
                          <View style={styles.exerciseHeader}>
                            <AppText weight="800" style={styles.exerciseName}>
                              {exercise.exercise?.name ?? 'Exercise'}
                            </AppText>
                            {showOneRm ? (
                              <AppText muted variant="small" style={styles.oneRmHeader}>
                                1RM
                              </AppText>
                            ) : null}
                          </View>

                          {exercise.sets.length ? (
                            exercise.sets.map((set, index) => {
                              const oneRm = getOneRepMax(set);
                              return (
                                <View key={set.id} style={styles.setRow}>
                                  <AppText muted style={styles.setIndex}>
                                    {setRowLabel(set.setType, index)}
                                  </AppText>
                                  <AppText muted numberOfLines={1} style={styles.setSummary}>
                                    {formatSetSummary(set)}
                                  </AppText>
                                  {showOneRm ? (
                                    <AppText muted style={styles.oneRmValue}>
                                      {oneRm != null ? formatNumber(Math.round(oneRm)) : '—'}
                                    </AppText>
                                  ) : null}
                                </View>
                              );
                            })
                          ) : (
                            <AppText muted variant="small">
                              No sets logged
                            </AppText>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <AppText muted>No exercises logged in this workout.</AppText>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MetricItem({ icon: Icon, value }: { icon: typeof Clock; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.metricItem}>
      <Icon size={13} color={theme.colors.muted} />
      <AppText muted variant="small" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function formatStartedAtLabel(iso: string): string {
  const date = new Date(iso);
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${timeLabel}, ${dateLabel}`;
}

function formatDuration(diffMs: number): string {
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return '--';
  }
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function setRowLabel(type: SetType, index: number): string {
  if (type === 'warmup') return 'W';
  if (type === 'drop') return 'D';
  if (type === 'failure') return 'F';
  if (type === 'assisted') return 'A';
  if (type === 'bodyweight') return 'B';
  if (type === 'timed') return 'T';
  return String(index + 1);
}

function formatSetSummary(set: WorkoutSet): string {
  const hasWeight = set.weightKg != null;
  const hasReps = set.reps != null;
  const hasDuration = set.durationSeconds != null;
  const hasDistance = set.distanceMeters != null;

  if (hasWeight && hasReps) {
    return `${formatNumber(set.weightKg ?? 0)} kg × ${formatNumber(set.reps ?? 0)}`;
  }

  if (hasReps) {
    return `${formatNumber(set.reps ?? 0)} reps`;
  }

  const parts: string[] = [];
  if (hasWeight) {
    parts.push(`${formatNumber(set.weightKg ?? 0)} kg`);
  }
  if (hasDuration) {
    parts.push(`${formatNumber(set.durationSeconds ?? 0)} s`);
  }
  if (hasDistance) {
    parts.push(`${formatNumber(set.distanceMeters ?? 0)} m`);
  }

  return parts.length ? parts.join(' • ') : '—';
}

function getOneRepMax(set: WorkoutSet): number | null {
  if (set.weightKg == null || set.reps == null || set.weightKg <= 0 || set.reps <= 0) {
    return null;
  }
  const value = estimatedOneRepMax(set.weightKg, set.reps);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,7,11,0.62)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '94%',
    minHeight: '72%',
    overflow: 'hidden',
  },
  headerRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerAction: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  editAction: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    justifyContent: 'center',
    minWidth: 70,
    paddingHorizontal: 10,
  },
  content: {
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  metaBlock: {
    gap: 9,
  },
  startedAtText: {
    fontSize: 13,
    lineHeight: 18,
  },
  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  metricItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    maxWidth: '100%',
  },
  exerciseList: {
    gap: 16,
    paddingBottom: 6,
  },
  exerciseBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingBottom: 13,
  },
  exerciseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  exerciseName: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    minWidth: 0,
  },
  oneRmHeader: {
    minWidth: 40,
    textAlign: 'right',
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 24,
  },
  setIndex: {
    minWidth: 16,
    textAlign: 'left',
  },
  setSummary: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    minWidth: 0,
  },
  oneRmValue: {
    minWidth: 40,
    textAlign: 'right',
  },
});
