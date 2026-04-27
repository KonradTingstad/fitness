import { Ellipsis, History, Check, Circle, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { WorkoutExercise } from '@/domain/models';
import { displaySetLabel, setTypeTone } from '@/features/workouts/utils/liveWorkout';
import { useAppTheme } from '@/theme/theme';

export type ActiveInputField = 'weightKg' | 'reps';

export interface WorkoutSetDraft {
  weightKg: string;
  reps: string;
  rpe: string;
}

interface Props {
  exercises: WorkoutExercise[];
  draftBySetId: Record<string, WorkoutSetDraft>;
  activeInput: { setId: string; field: ActiveInputField } | null;
  onSelectInput: (setId: string, field: ActiveInputField) => void;
  onOpenSetTypeMenu: (setId: string) => void;
  onToggleSetComplete: (setId: string) => void;
  onAddSet: (workoutExerciseId: string) => void;
  onOpenHistory: (exerciseId: string) => void;
  onOpenExerciseMenu?: (workoutExerciseId: string) => void;
}

export function SetLoggingTable({
  exercises,
  draftBySetId,
  activeInput,
  onSelectInput,
  onOpenSetTypeMenu,
  onToggleSetComplete,
  onAddSet,
  onOpenHistory,
  onOpenExerciseMenu,
}: Props) {
  const theme = useAppTheme();

  return (
    <>
      {exercises.map((exercise, exerciseIndex) => (
        <View
          key={exercise.id}
          style={[
            styles.exerciseSection,
            {
              borderTopColor: exerciseIndex > 0 ? theme.colors.border : 'transparent',
            },
          ]}
        >
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseCopy}>
              <AppText variant="section">{exercise.exercise?.name ?? 'Exercise'}</AppText>
              <AppText muted variant="small">
                {exercise.exercise?.primaryMuscle ?? 'Body'} • {exercise.exercise?.equipment ?? 'Equipment'}
              </AppText>
            </View>
            <View style={styles.exerciseActions}>
              <Pressable
                onPress={() => onOpenHistory(exercise.exerciseId)}
                style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.border, opacity: pressed ? 0.82 : 1 }]}
              >
                <History size={15} color={theme.colors.muted} />
              </Pressable>
              <Pressable
                onPress={() => onOpenExerciseMenu?.(exercise.id)}
                style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.border, opacity: pressed ? 0.82 : 1 }]}
              >
                <Ellipsis size={15} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.tableGroup, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.02)' }]}>
            <View style={[styles.tableHeader, { borderBottomColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.02)' }]}>
              <AppText variant="small" muted>
                Set
              </AppText>
              <AppText variant="small" muted>
                Previous
              </AppText>
              <AppText variant="small" muted>
                kg
              </AppText>
              <AppText variant="small" muted>
                Reps
              </AppText>
              <AppText variant="small" muted>
                ✓
              </AppText>
            </View>

            {exercise.sets.map((set) => {
              const draft = draftBySetId[set.id] ?? {
                weightKg: set.weightKg != null ? formatValue(set.weightKg) : '',
                reps: set.reps != null ? formatValue(set.reps) : '',
                rpe: set.rpe != null ? formatValue(set.rpe) : '',
              };
              const previous =
                set.previousWeightKg != null || set.previousReps != null
                  ? `${formatValue(set.previousWeightKg ?? 0)} × ${formatValue(set.previousReps ?? 0)}`
                  : '—';
              const setTone = setTypeTone(set.setType);
              const setColor =
                setTone === 'warmup'
                  ? theme.colors.warning
                  : setTone === 'drop'
                    ? theme.colors.accent
                    : setTone === 'failure'
                      ? theme.colors.danger
                      : theme.colors.text;

              return (
                <View key={set.id} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                  <Pressable onPress={() => onOpenSetTypeMenu(set.id)} style={styles.setLabelWrap}>
                    <AppText weight="800" style={{ color: setColor }}>
                      {displaySetLabel(set)}
                    </AppText>
                  </Pressable>

                  <AppText muted variant="small" style={styles.previousCell}>
                    {previous}
                  </AppText>

                  <FieldCell
                    value={draft.weightKg}
                    active={activeInput?.setId === set.id && activeInput.field === 'weightKg'}
                    onPress={() => onSelectInput(set.id, 'weightKg')}
                  />

                  <FieldCell
                    value={draft.reps}
                    active={activeInput?.setId === set.id && activeInput.field === 'reps'}
                    onPress={() => onSelectInput(set.id, 'reps')}
                  />

                  <Pressable
                    onPress={() => onToggleSetComplete(set.id)}
                    style={({ pressed }) => [
                      styles.checkCell,
                      {
                        borderColor: set.isCompleted ? theme.colors.primary : theme.colors.border,
                        backgroundColor: set.isCompleted ? 'rgba(53,199,122,0.2)' : theme.colors.surfaceAlt,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {set.isCompleted ? <Check size={16} color={theme.colors.primary} /> : <Circle size={16} color={theme.colors.muted} />}
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              onPress={() => onAddSet(exercise.id)}
              style={({ pressed }) => [
                styles.addSetButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <View style={[styles.addSetIconWrap, { borderColor: theme.colors.border }]}>
                <Plus size={14} color={theme.colors.primary} />
              </View>
              <AppText weight="700" style={{ color: theme.colors.primary }}>
                Add Set
              </AppText>
            </Pressable>
          </View>
        </View>
      ))}
    </>
  );
}

function FieldCell({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fieldCell,
        {
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <AppText weight="800" style={{ color: value ? theme.colors.text : theme.colors.muted }}>
        {value || '-'}
      </AppText>
    </Pressable>
  );
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

const styles = StyleSheet.create({
  exerciseSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingTop: 16,
  },
  exerciseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exerciseCopy: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  tableGroup: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tableHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 34,
    paddingHorizontal: 6,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  setLabelWrap: {
    alignItems: 'center',
    width: 26,
  },
  previousCell: {
    flex: 1,
  },
  fieldCell: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 58,
    paddingHorizontal: 8,
  },
  checkCell: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 38,
    width: 42,
  },
  addSetButton: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    justifyContent: 'center',
  },
  addSetIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
});
