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
  validationErrorsBySetId?: Record<string, { reps: boolean }>;
  activeInput: { setId: string; field: ActiveInputField } | null;
  onSelectInput: (setId: string, field: ActiveInputField) => void;
  onOpenSetTypeMenu: (setId: string) => void;
  onToggleSetComplete: (setId: string) => void;
  onAddSet: (workoutExerciseId: string) => void;
  onOpenHistory: (exerciseId: string) => void;
  onOpenExerciseMenu?: (workoutExerciseId: string) => void;
}

const SET_COLUMN_WIDTH = 40;
const METRIC_COLUMN_WIDTH = 62;
const CHECK_COLUMN_WIDTH = 42;
const COLUMN_GAP = 6;
const ROW_CONTENT_HORIZONTAL_PADDING = 14;

export function SetLoggingTable({
  exercises,
  draftBySetId,
  validationErrorsBySetId,
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
                <View
                  key={set.id}
                  style={[
                    styles.row,
                    {
                      borderBottomColor: theme.colors.border,
                      backgroundColor: set.isCompleted ? 'rgba(53,199,122,0.12)' : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.rowContent}>
                    <Pressable
                      onPress={() => onOpenSetTypeMenu(set.id)}
                      style={({ pressed }) => [styles.setLabelWrap, labelSurfaceStyle, { opacity: pressed ? 0.82 : 1 }]}
                    >
                      <AppText weight="700" style={[styles.setLabelText, { color: setColor }]}>
                        {setLabel}
                      </AppText>
                    </Pressable>

                    <AppText muted variant="small" numberOfLines={1} style={styles.previousText}>
                      {previous}
                    </AppText>

                    <FieldCell
                      value={draft.weightKg}
                      active={activeInput?.setId === set.id && activeInput.field === 'weightKg'}
                      invalid={false}
                      onPress={() => onSelectInput(set.id, 'weightKg')}
                    />

                    <FieldCell
                      value={draft.reps}
                      active={activeInput?.setId === set.id && activeInput.field === 'reps'}
                      invalid={Boolean(validationErrorsBySetId?.[set.id]?.reps)}
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

function FieldCell({ value, active, invalid, onPress }: { value: string; active: boolean; invalid: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const borderColor = invalid ? theme.colors.danger : active ? theme.colors.primary : 'transparent';
  const borderWidth = invalid || active ? 1 : 0;
  const backgroundColor = invalid ? 'rgba(242,95,92,0.14)' : theme.colors.surfaceAlt;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fieldCell,
        {
          borderColor,
          borderWidth,
          backgroundColor,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <AppText
        weight="700"
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[styles.fieldValueText, { color: value ? theme.colors.text : theme.colors.muted }]}
      >
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
    gap: COLUMN_GAP,
    marginHorizontal: -ROW_CONTENT_HORIZONTAL_PADDING,
    minHeight: 32,
    paddingHorizontal: ROW_CONTENT_HORIZONTAL_PADDING,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -ROW_CONTENT_HORIZONTAL_PADDING,
    minHeight: 46,
    justifyContent: 'center',
  },
  rowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: COLUMN_GAP,
    paddingHorizontal: ROW_CONTENT_HORIZONTAL_PADDING,
    paddingVertical: 3,
  },
  setLabelWrap: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 24,
    width: SET_COLUMN_WIDTH,
  },
  columnHeaderText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  setLabelHeader: {
    textAlign: 'center',
    width: SET_COLUMN_WIDTH,
  },
  setLabelText: {
    fontSize: 13,
  },
  previousCell: {
    flex: 1,
    textAlign: 'center',
  },
  previousText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.82,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  metricHeader: {
    textAlign: 'center',
    width: METRIC_COLUMN_WIDTH,
  },
  checkHeader: {
    textAlign: 'center',
    width: CHECK_COLUMN_WIDTH,
  },
  fieldCell: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    width: METRIC_COLUMN_WIDTH,
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
    width: CHECK_COLUMN_WIDTH,
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
