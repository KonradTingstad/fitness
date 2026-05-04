import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Check, Clock, Dumbbell, Pencil, Trophy, Weight, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { getWorkoutSession } from '@/data/repositories/workoutRepository';
import { calculateWorkoutVolume } from '@/domain/calculations/workout';
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
    queryKey: sessionId ? queryKeys.workout(sessionId) : ['workout', 'modal-preview'] as const,
    queryFn: () => getWorkoutSession(sessionId as string),
    enabled: visible && Boolean(sessionId),
  });

  const metrics = useMemo(() => {
    if (!session.data) {
      return {
        duration: '--',
        volumeKg: 0,
        totalSets: 0,
        prs: 0,
      };
    }

    const allSets = session.data.exercises.flatMap((exercise) => exercise.sets);
    const completedSets = allSets.filter((set) => set.isCompleted);
    const endedAt = session.data.endedAt ? new Date(session.data.endedAt) : new Date();
    const diffMs = endedAt.getTime() - new Date(session.data.startedAt).getTime();
    const duration = formatDuration(diffMs);
    const prs = completedSets.filter(
      (set) => (set.weightKg ?? 0) > (set.previousWeightKg ?? 0) && (set.reps ?? 0) >= (set.previousReps ?? 0),
    ).length;

    return {
      duration,
      volumeKg: Math.round(calculateWorkoutVolume(completedSets)),
      totalSets: allSets.length,
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
              backgroundColor: 'rgba(11,16,22,0.98)',
              marginTop: Math.max(14, insets.top + 8),
              paddingBottom: Math.max(14, insets.bottom + 10),
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>

          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close workout details"
              onPress={onClose}
              style={({ pressed }) => [styles.headerIcon, { borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <X size={16} color={theme.colors.text} />
            </Pressable>

            <AppText variant="section" numberOfLines={1} style={styles.headerTitle}>
              {session.data?.title ?? 'Workout details'}
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
                styles.editButton,
                {
                  borderColor: 'rgba(53,199,122,0.38)',
                  backgroundColor: 'rgba(53,199,122,0.16)',
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
              <View style={[styles.statusCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText muted>Loading workout…</AppText>
              </View>
            ) : session.isError || !session.data ? (
              <View style={[styles.statusCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText muted>
                  {session.error instanceof Error ? session.error.message : 'Could not load workout details.'}
                </AppText>
              </View>
            ) : (
              <>
                <LinearGradient
                  colors={['rgba(23,31,40,0.98)', 'rgba(18,26,34,0.98)', 'rgba(14,21,29,0.98)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.heroCard, { borderColor: theme.colors.border }]}
                >
                  <View style={styles.heroGlow} pointerEvents="none" />

                  <AppText variant="title" numberOfLines={2} style={styles.heroTitle}>
                    {session.data.title}
                  </AppText>

                  <View style={styles.heroMetaRow}>
                    <MetaPill icon={Calendar} label={formatDateLabel(session.data.startedAt)} />
                    <MetaPill
                      icon={Clock}
                      label={`${formatTimeLabel(session.data.startedAt)}${session.data.endedAt ? ` - ${formatTimeLabel(session.data.endedAt)}` : ''}`}
                    />
                  </View>

                  <View style={styles.metricGrid}>
                    <MetricTile icon={Clock} label="Duration" value={metrics.duration} />
                    <MetricTile icon={Check} label="Sets" value={String(metrics.totalSets)} />
                    <MetricTile icon={Weight} label="Volume" value={`${metrics.volumeKg.toLocaleString()} kg`} />
                    <MetricTile icon={Trophy} label="PRs" value={String(metrics.prs)} />
                  </View>
                </LinearGradient>

                <View style={styles.sectionHeader}>
                  <AppText variant="section">Exercises</AppText>
                  <AppText muted variant="small">
                    {session.data.exercises.length}
                  </AppText>
                </View>

                {session.data.exercises.length ? (
                  session.data.exercises.map((exercise) => (
                    <View
                      key={exercise.id}
                      style={[
                        styles.exerciseCard,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                        },
                      ]}
                    >
                      <View style={styles.exerciseHeader}>
                        <View style={styles.exerciseIconWrap}>
                          <Dumbbell size={14} color={theme.colors.primary} />
                        </View>
                        <View style={styles.exerciseHeaderText}>
                          <AppText weight="800">{exercise.exercise?.name ?? 'Exercise'}</AppText>
                          <AppText muted variant="small" numberOfLines={1}>
                            {exercise.exercise?.primaryMuscle ?? 'Body'} • {exercise.exercise?.equipment ?? 'Equipment'}
                          </AppText>
                        </View>
                        <AppText muted variant="small">
                          {exercise.sets.length} sets
                        </AppText>
                      </View>

                      <View style={styles.setList}>
                        {exercise.sets.map((set, setIndex) => (
                          <View
                            key={set.id}
                            style={[
                              styles.setRow,
                              {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surface,
                              },
                            ]}
                          >
                            <View style={styles.setLead}>
                              <View
                                style={[
                                  styles.setTypeBadge,
                                  {
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surfaceAlt,
                                  },
                                ]}
                              >
                                <AppText variant="small" weight="700">
                                  {setTypeLabel(set.setType)}
                                </AppText>
                              </View>
                              <AppText muted variant="small">
                                Set {setIndex + 1}
                              </AppText>
                            </View>

                            <View style={styles.setValueWrap}>
                              <AppText weight="700" numberOfLines={1} style={styles.setValueText}>
                                {formatSetSummary(set)}
                              </AppText>
                              <AppText muted variant="small" numberOfLines={1}>
                                {formatSetExtra(set)}
                              </AppText>
                            </View>

                            {set.isCompleted ? <Check size={15} color={theme.colors.primary} /> : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={[styles.statusCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <AppText muted>No exercises logged in this workout.</AppText>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MetaPill({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metaPill, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      <Icon size={13} color={theme.colors.muted} />
      <AppText variant="small" muted numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function MetricTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metricTile, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      <View style={[styles.metricIcon, { backgroundColor: 'rgba(53,199,122,0.14)' }]}>
        <Icon size={12} color={theme.colors.primary} />
      </View>
      <View style={styles.metricText}>
        <AppText muted variant="small">
          {label}
        </AppText>
        <AppText weight="800">{value}</AppText>
      </View>
    </View>
  );
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
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

function formatSetSummary(set: WorkoutSet): string {
  const hasWeight = set.weightKg != null;
  const hasReps = set.reps != null;
  const hasDuration = set.durationSeconds != null;
  const hasDistance = set.distanceMeters != null;

  if (hasWeight && hasReps) {
    return `${formatNumber(set.weightKg ?? 0)} kg x ${formatNumber(set.reps ?? 0)}`;
  }

  const parts: string[] = [];
  if (hasWeight) {
    parts.push(`${formatNumber(set.weightKg ?? 0)} kg`);
  }
  if (hasReps) {
    parts.push(`${formatNumber(set.reps ?? 0)} reps`);
  }
  if (hasDuration) {
    parts.push(`${formatNumber(set.durationSeconds ?? 0)} s`);
  }
  if (hasDistance) {
    parts.push(`${formatNumber(set.distanceMeters ?? 0)} m`);
  }

  return parts.length ? parts.join(' • ') : '--';
}

function formatSetExtra(set: WorkoutSet): string {
  const extras: string[] = [];
  if (set.rpe != null) {
    extras.push(`RPE ${formatNumber(set.rpe)}`);
  }
  if (set.rir != null) {
    extras.push(`RIR ${formatNumber(set.rir)}`);
  }
  if (!extras.length) {
    return ' '; // keeps row height stable
  }
  return extras.join(' • ');
}

function setTypeLabel(type: SetType): string {
  if (type === 'warmup') return 'Warmup';
  if (type === 'drop') return 'Dropset';
  if (type === 'failure') return 'Failure';
  if (type === 'assisted') return 'Assisted';
  if (type === 'bodyweight') return 'Bodyweight';
  if (type === 'timed') return 'Timed';
  return 'Normal';
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
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
    backgroundColor: 'rgba(4,7,11,0.58)',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '95%',
    minHeight: '78%',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    borderRadius: 999,
    height: 4,
    width: 44,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  headerIcon: {
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
  editButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    minWidth: 64,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  content: {
    gap: 10,
    paddingBottom: 8,
  },
  statusCard: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: 12,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  heroGlow: {
    backgroundColor: 'rgba(53,199,122,0.14)',
    borderRadius: 999,
    height: 140,
    position: 'absolute',
    right: -38,
    top: -48,
    width: 140,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    paddingRight: 12,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metaPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    maxWidth: '100%',
    paddingHorizontal: 9,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metricTile: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 9,
    paddingVertical: 7,
    width: '48.5%',
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  metricText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  exerciseCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 10,
  },
  exerciseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  exerciseIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    width: 28,
  },
  exerciseHeaderText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  setList: {
    gap: 6,
  },
  setRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  setLead: {
    gap: 3,
    width: 90,
  },
  setTypeBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  setValueWrap: {
    flex: 1,
    minWidth: 0,
  },
  setValueText: {
    fontSize: 14,
    lineHeight: 18,
  },
});
