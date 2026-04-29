import { Ellipsis, History, Check, Circle, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { WorkoutExercise } from '@/domain/models';
import { setTypeTone } from '@/features/workouts/utils/liveWorkout';
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
              marginTop: exerciseIndex > 0 ? 8 : 0,
            },
          ]}
        >
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseCopy}>
              <AppText variant="section" weight="800" style={styles.exerciseTitle}>
                {exercise.exercise?.name ?? 'Exercise'}
              </AppText>
              <AppText muted variant="small" style={styles.exerciseMeta}>
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

          <View style={styles.tableGroup}>
            <View style={[styles.tableHeader, { borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
              <AppText variant="small" muted style={[styles.columnHeaderText, styles.setLabelHeader]}>
                Set
              </AppText>
              <AppText variant="small" muted style={[styles.columnHeaderText, styles.previousCell]}>
                Previous
              </AppText>
              <AppText variant="small" muted style={[styles.columnHeaderText, styles.metricHeader]}>
                kg
              </AppText>
              <AppText variant="small" muted style={[styles.columnHeaderText, styles.metricHeader]}>
                Reps
              </AppText>
              <AppText variant="small" muted style={[styles.columnHeaderText, styles.checkHeader]}>
                ✓
              </AppText>
            </View>

            {exercise.sets.map((set, setIndex) => {
              const normalSetIndex = exercise.sets.slice(0, setIndex + 1).filter((item) => setTypeTone(item.setType) === 'normal').length;
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
              const setLabel = setTone === 'warmup' ? 'W' : setTone === 'drop' ? 'D' : setTone === 'failure' ? 'F' : String(normalSetIndex);
              const setColor =
                setTone === 'warmup'
                  ? theme.colors.warning
                  : setTone === 'drop'
                    ? theme.colors.accent
                    : setTone === 'failure'
                      ? theme.colors.danger
                      : theme.colors.text;
              const labelSurfaceStyle =
                setTone === 'warmup'
                  ? { backgroundColor: 'rgba(244,183,64,0.16)', borderColor: 'rgba(244,183,64,0.48)' }
                  : setTone === 'drop'
                    ? { backgroundColor: 'rgba(155,140,255,0.15)', borderColor: 'rgba(155,140,255,0.5)' }
                    : setTone === 'failure'
                      ? { backgroundColor: 'rgba(242,95,92,0.16)', borderColor: 'rgba(242,95,92,0.5)' }
                      : { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border };

              return (
                <View key={set.id} style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                  <Pressable
                    onPress={() => onOpenSetTypeMenu(set.id)}
                    style={({ pressed }) => [styles.setLabelWrap, labelSurfaceStyle, { opacity: pressed ? 0.82 : 1 }]}
                  >
                    <AppText weight="700" style={[styles.setLabelText, { color: setColor }]}>
                      {setLabel}
                    </AppText>
                  </Pressable>

                  <AppText muted variant="small" style={styles.previousText}>
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
                        borderWidth: set.isCompleted ? StyleSheet.hairlineWidth : 0,
                        backgroundColor: set.isCompleted ? 'rgba(53,199,122,0.2)' : theme.colors.surfaceAlt,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {set.isCompleted ? <Check size={14} color={theme.colors.primary} /> : <Circle size={14} color={theme.colors.muted} />}
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
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <View style={[styles.addSetIconWrap, { borderColor: theme.colors.border }]}>
                <Plus size={14} color={theme.colors.primary} />
              </View>
              <AppText weight="700" style={[styles.addSetText, { color: theme.colors.primary }]}>
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
          borderColor: active ? theme.colors.primary : 'transparent',
          borderWidth: active ? 1 : 0,
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <AppText weight="700" style={[styles.fieldValueText, { color: value ? theme.colors.text : theme.colors.muted }]}>
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
    gap: 6,
    paddingTop: 12,
  },
  exerciseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exerciseCopy: {
    flex: 1,
    gap: 2,
    paddingRight: 10,
  },
  exerciseTitle: {
    fontSize: 16,
    lineHeight: 21,
  },
  exerciseMeta: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.78,
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 5,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  tableGroup: {
    gap: 0,
  },
  tableHeader: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 32,
    paddingHorizontal: 6,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  setLabelWrap: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 30,
    paddingHorizontal: 6,
  },
  columnHeaderText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  setLabelHeader: {
    width: 34,
  },
  setLabelText: {
    fontSize: 13,
  },
  previousCell: {
    flex: 1,
  },
  previousText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.82,
  },
  metricHeader: {
    textAlign: 'center',
    width: 56,
  },
  checkHeader: {
    textAlign: 'center',
    width: 36,
  },
  fieldCell: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    width: 56,
    paddingHorizontal: 6,
  },
  fieldValueText: {
    fontSize: 14,
    lineHeight: 18,
  },
  checkCell: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    width: 36,
  },
  addSetButton: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    justifyContent: 'center',
  },
  addSetIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  addSetText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
