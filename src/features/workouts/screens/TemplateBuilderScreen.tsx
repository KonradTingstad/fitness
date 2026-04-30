import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Dumbbell, Plus, Trash2 } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { deleteRoutineTemplate, saveRoutineTemplate } from '@/data/repositories/workoutRepository';
import { Exercise, RoutineExercise, SetType } from '@/domain/models';
import { ExercisePickerSheet } from '@/features/workouts/components/live/ExercisePickerSheet';
import { useExercises, useRoutines } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TemplateBuilder'>;

const WORKOUT_GROUP_STORAGE_KEY = 'fitness.workoutGroups.v1';

interface WorkoutGroupStorage {
  id: string;
  name: string;
  routineIds: string[];
}

interface DraftSet {
  id: string;
  setType: SetType;
  targetReps: string;
  targetWeightKg: string;
}

interface DraftExercise {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  sets: DraftSet[];
}

export function TemplateBuilderScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const params = route.params ?? {};
  const queryClient = useQueryClient();
  const routines = useRoutines();
  const exercises = useExercises();
  const isEditMode = Boolean(params.routineId);
  const routine = useMemo(
    () => (params.routineId ? (routines.data ?? []).find((item) => item.id === params.routineId) : undefined),
    [params.routineId, routines.data],
  );

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [templateExercises, setTemplateExercises] = useState<DraftExercise[]>([]);
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isEditMode) {
      if (initializedId !== 'new') {
        setName('');
        setNotes('');
        setTemplateExercises([]);
        setInitializedId('new');
      }
      return;
    }

    if (routines.isLoading || !routine || initializedId === routine.id) {
      return;
    }

    setName(routine.name);
    setNotes(routine.notes ?? '');
    setTemplateExercises(routine.exercises.map(mapRoutineExerciseToDraft));
    setInitializedId(routine.id);
  }, [initializedId, isEditMode, routine, routines.isLoading]);

  const exerciseById = useMemo(() => new Map((exercises.data ?? []).map((item) => [item.id, item])), [exercises.data]);
  const addedExerciseIds = useMemo(() => new Set(templateExercises.map((exercise) => exercise.exerciseId)), [templateExercises]);
  const canSave = name.trim().length > 0 && templateExercises.length > 0;

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const routineId = await saveRoutineTemplate({
        routineId: params.routineId,
        name,
        notes,
        exercises: templateExercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          notes: null,
          supersetGroup: null,
          defaultRestSeconds: 120,
          sets: exercise.sets.length
            ? exercise.sets.map((set) => ({
                setType: set.setType,
                targetReps: toOptionalInteger(set.targetReps),
                targetWeightKg: toOptionalDecimal(set.targetWeightKg),
              }))
            : [{ setType: 'normal', targetReps: null, targetWeightKg: null }],
        })),
      });
      if (params.groupId) {
        try {
          await assignRoutineToGroup(params.groupId, params.groupName ?? 'Ungrouped', routineId);
        } catch {
          // Keep save successful even if local group mapping fails.
        }
      }
      return routineId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines });
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && (query.queryKey[0] === 'workoutPlans' || query.queryKey[0] === 'programSchedule'),
      });
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert('Save template', error instanceof Error ? error.message : 'Unable to save template.');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (routineId: string) => {
      await deleteRoutineTemplate(routineId);
      try {
        await removeRoutineFromGroups(routineId);
      } catch {
        // Keep delete successful even if local group mapping fails.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.routines });
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && (query.queryKey[0] === 'workoutPlans' || query.queryKey[0] === 'programSchedule'),
      });
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert('Delete template', error instanceof Error ? error.message : 'Unable to delete template.');
    },
  });

  const confirmDeleteTemplate = () => {
    const routineId = params.routineId;
    if (!routineId || deleteTemplate.isPending) {
      return;
    }
    Alert.alert('Delete template?', 'This template will be removed from your program library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTemplate.mutate(routineId) },
    ]);
  };

  if ((routines.isLoading || exercises.isLoading) && isEditMode) {
    return <LoadingState label="Loading template builder" />;
  }

  if (isEditMode && !routine && !routines.isLoading) {
    return (
      <Screen>
        <Card>
          <AppText variant="section">Template not found</AppText>
          <AppText muted>The selected template could not be loaded.</AppText>
          <Button label="Back" onPress={() => navigation.goBack()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} style={styles.screenContent}>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.headerShell, { borderColor: withAlpha(theme.colors.border, 0.95), backgroundColor: withAlpha(theme.colors.surface, 0.72) }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.headerGhostButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.8),
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <AppText weight="700" variant="small" style={{ color: theme.colors.muted }}>
                Cancel
              </AppText>
            </Pressable>

            <AppText variant="section" style={styles.headerTitle}>
              {isEditMode ? 'Edit template' : 'New template'}
            </AppText>

            <Pressable
              accessibilityRole="button"
              disabled={!canSave || saveTemplate.isPending || deleteTemplate.isPending}
              onPress={() => saveTemplate.mutate()}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.primary,
                  opacity: !canSave || saveTemplate.isPending || deleteTemplate.isPending ? 0.45 : pressed ? 0.84 : 1,
                },
              ]}
            >
              <Check size={13} color="#08100C" />
              <AppText weight="800" variant="small" style={{ color: '#08100C' }}>
                Save
              </AppText>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="section">Template details</AppText>
              <AppText muted variant="small">
                Name and notes
              </AppText>
            </View>

            <View style={[styles.fieldShell, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.72) }]}>
              <AppText muted variant="small">
                Template name
              </AppText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Upper Strength"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { color: theme.colors.text, borderColor: withAlpha(theme.colors.border, 0.9), backgroundColor: withAlpha(theme.colors.surface, 0.8) }]}
              />
            </View>

            <View style={[styles.fieldShell, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.72) }]}>
              <AppText muted variant="small">
                Notes (optional)
              </AppText>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
                placeholder="Focus points, tempo, or cues"
                placeholderTextColor={theme.colors.muted}
                style={[
                  styles.input,
                  styles.notesInput,
                  { color: theme.colors.text, borderColor: withAlpha(theme.colors.border, 0.9), backgroundColor: withAlpha(theme.colors.surface, 0.76) },
                ]}
              />
            </View>

            {isEditMode ? (
              <Pressable
                accessibilityRole="button"
                disabled={deleteTemplate.isPending || saveTemplate.isPending}
                onPress={confirmDeleteTemplate}
                style={({ pressed }) => [
                  styles.deleteButton,
                  {
                    borderColor: withAlpha(theme.colors.danger, 0.48),
                    backgroundColor: withAlpha(theme.colors.danger, 0.08),
                    opacity: deleteTemplate.isPending || saveTemplate.isPending ? 0.52 : pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Trash2 size={14} color={theme.colors.danger} />
                <AppText weight="700" variant="small" style={{ color: theme.colors.danger }}>
                  {deleteTemplate.isPending ? 'Deleting template…' : 'Delete template'}
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.spaceBetween}>
              <View style={styles.sectionHeader}>
                <AppText variant="section">Exercises</AppText>
                <AppText muted variant="small">
                  {templateExercises.length} planned
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPickerSelectedIds(new Set());
                  setPickerOpen(true);
                }}
                style={({ pressed }) => [
                  styles.addExerciseButton,
                  {
                    borderColor: withAlpha(theme.colors.primary, 0.52),
                    backgroundColor: withAlpha(theme.colors.primary, 0.12),
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Plus size={14} color={theme.colors.primary} />
                <AppText weight="700" variant="small" style={{ color: theme.colors.primary }}>
                  Add exercises
                </AppText>
              </Pressable>
            </View>

            {templateExercises.length ? (
              templateExercises.map((exercise, index) => (
                <View
                  key={exercise.id}
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: withAlpha(theme.colors.border, 0.95),
                      backgroundColor: withAlpha(theme.colors.surface, 0.76),
                    },
                  ]}
                >
                  <View style={[styles.exerciseAccent, { backgroundColor: withAlpha(theme.colors.primary, 0.72) }]} />
                  <View style={styles.exerciseHeader}>
                    <View style={styles.exerciseCopy}>
                      <View style={styles.exerciseMetaTop}>
                        <View style={[styles.exerciseIndexPill, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.72) }]}>
                          <AppText variant="small" weight="700" style={{ color: theme.colors.muted }}>
                            {index + 1}
                          </AppText>
                        </View>
                        <AppText muted variant="small">
                          {exercise.sets.length} planned {exercise.sets.length === 1 ? 'set' : 'sets'}
                        </AppText>
                      </View>
                      <AppText weight="800" style={styles.exerciseTitle}>
                        {exercise.name}
                      </AppText>
                      <AppText muted variant="small">
                        {toTitleCase(exercise.primaryMuscle)} • {toTitleCase(exercise.equipment)}
                      </AppText>
                    </View>
                    <View style={styles.exerciseActionRow}>
                      <IconButton
                        disabled={index === 0}
                        icon={ChevronUp}
                        onPress={() => {
                          if (index === 0) return;
                          setTemplateExercises((current) => swapItems(current, index, index - 1));
                        }}
                      />
                      <IconButton
                        disabled={index === templateExercises.length - 1}
                        icon={ChevronDown}
                        onPress={() => {
                          if (index === templateExercises.length - 1) return;
                          setTemplateExercises((current) => swapItems(current, index, index + 1));
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        onPress={() => setTemplateExercises((current) => current.filter((item) => item.id !== exercise.id))}
                        tone="danger"
                      />
                    </View>
                  </View>

                  <View style={[styles.setsShell, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.64) }]}>
                    <View style={styles.setHeaderRow}>
                      <AppText muted variant="small" style={styles.setIndexCol}>
                        Set
                      </AppText>
                      <AppText muted variant="small" style={styles.setInputCol}>
                        Reps
                      </AppText>
                      <AppText muted variant="small" style={styles.setInputCol}>
                        Kg
                      </AppText>
                      <View style={styles.setActionCol} />
                    </View>

                    {exercise.sets.map((set, setIndex) => (
                      <View key={set.id} style={styles.setRow}>
                        <View style={[styles.setIndexPill, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surface, 0.78) }]}>
                          <AppText muted variant="small" style={styles.setIndexText}>
                            {setIndex + 1}
                          </AppText>
                        </View>
                        <TextInput
                          value={set.targetReps}
                          onChangeText={(value) =>
                            setTemplateExercises((current) =>
                              current.map((item) =>
                                item.id === exercise.id
                                  ? {
                                      ...item,
                                      sets: item.sets.map((entry) =>
                                        entry.id === set.id ? { ...entry, targetReps: sanitizeIntegerInput(value) } : entry,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          keyboardType="number-pad"
                          placeholder="-"
                          placeholderTextColor={theme.colors.muted}
                          style={[
                            styles.setInput,
                            { color: theme.colors.text, borderColor: withAlpha(theme.colors.border, 0.95), backgroundColor: withAlpha(theme.colors.surface, 0.82) },
                          ]}
                        />
                        <TextInput
                          value={set.targetWeightKg}
                          onChangeText={(value) =>
                            setTemplateExercises((current) =>
                              current.map((item) =>
                                item.id === exercise.id
                                  ? {
                                      ...item,
                                      sets: item.sets.map((entry) =>
                                        entry.id === set.id ? { ...entry, targetWeightKg: sanitizeDecimalInput(value) } : entry,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          keyboardType="decimal-pad"
                          placeholder="-"
                          placeholderTextColor={theme.colors.muted}
                          style={[
                            styles.setInput,
                            { color: theme.colors.text, borderColor: withAlpha(theme.colors.border, 0.95), backgroundColor: withAlpha(theme.colors.surface, 0.82) },
                          ]}
                        />
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setTemplateExercises((current) =>
                              current.map((item) =>
                                item.id === exercise.id
                                  ? { ...item, sets: item.sets.filter((entry) => entry.id !== set.id) }
                                  : item,
                              ),
                            )
                          }
                          style={({ pressed }) => [
                            styles.setRemoveButton,
                            {
                              borderColor: withAlpha(theme.colors.danger, 0.44),
                              backgroundColor: withAlpha(theme.colors.danger, 0.1),
                              opacity: pressed ? 0.76 : 1,
                            },
                          ]}
                        >
                          <Trash2 size={13} color={theme.colors.danger} />
                        </Pressable>
                      </View>
                    ))}

                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        setTemplateExercises((current) =>
                          current.map((item) =>
                            item.id === exercise.id
                              ? { ...item, sets: [...item.sets, createDraftSet()] }
                              : item,
                          ),
                        )
                      }
                      style={({ pressed }) => [
                        styles.addSetButton,
                        {
                          borderColor: withAlpha(theme.colors.border, 0.9),
                          backgroundColor: withAlpha(theme.colors.surface, 0.56),
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <Plus size={13} color={theme.colors.muted} />
                      <AppText muted variant="small" weight="700">
                        Add set
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [
                  styles.emptyExercisesState,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.62),
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <View style={[styles.emptyIcon, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surface, 0.8) }]}>
                  <Dumbbell size={18} color={theme.colors.muted} />
                </View>
                <View style={styles.emptyCopy}>
                  <AppText variant="section">No exercises yet</AppText>
                  <AppText muted variant="small">
                    Add exercises to start building this template.
                  </AppText>
                </View>
                <View style={[styles.emptyAddPill, { borderColor: withAlpha(theme.colors.primary, 0.5), backgroundColor: withAlpha(theme.colors.primary, 0.14) }]}>
                  <Plus size={12} color={theme.colors.primary} />
                  <AppText variant="small" weight="700" style={{ color: theme.colors.primary }}>
                    Add
                  </AppText>
                </View>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <ExercisePickerSheet
          visible={pickerOpen}
          exercises={exercises.data ?? []}
          selectedIds={pickerSelectedIds}
          lockedIds={addedExerciseIds}
          onToggleSelection={(exerciseId) =>
            setPickerSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(exerciseId)) {
                next.delete(exerciseId);
              } else {
                next.add(exerciseId);
              }
              return next;
            })
          }
          onClose={() => {
            setPickerOpen(false);
            setPickerSelectedIds(new Set());
          }}
          onAddSelected={() => {
            const selectedIds = Array.from(pickerSelectedIds);
            if (!selectedIds.length) {
              return;
            }
            setTemplateExercises((current) => {
              const next = [...current];
              for (const exerciseId of selectedIds) {
                if (next.some((item) => item.exerciseId === exerciseId)) {
                  continue;
                }
                const selectedExercise = exerciseById.get(exerciseId);
                if (!selectedExercise) {
                  continue;
                }
                next.push(createDraftExercise(selectedExercise));
              }
              return next;
            });
            setPickerOpen(false);
            setPickerSelectedIds(new Set());
          }}
          previousPerformanceByExerciseId={{}}
        />
      </View>
    </Screen>
  );
}

function createDraftExercise(exercise: Exercise): DraftExercise {
  return {
    id: createDraftId('template_exercise'),
    exerciseId: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    equipment: exercise.equipment,
    sets: [createDraftSet()],
  };
}

function createDraftSet(setType: SetType = 'normal'): DraftSet {
  return {
    id: createDraftId('template_set'),
    setType,
    targetReps: '',
    targetWeightKg: '',
  };
}

function mapRoutineExerciseToDraft(exercise: RoutineExercise): DraftExercise {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.exercise?.name ?? 'Exercise',
    primaryMuscle: exercise.exercise?.primaryMuscle ?? 'Unknown',
    equipment: exercise.exercise?.equipment ?? 'Unknown',
    sets: exercise.setTemplates.length
      ? exercise.setTemplates.map((set) => ({
          id: set.id,
          setType: set.setType,
          targetReps: set.targetRepsMax != null ? String(set.targetRepsMax) : set.targetRepsMin != null ? String(set.targetRepsMin) : '',
          targetWeightKg: set.targetWeightKg != null ? String(set.targetWeightKg) : '',
        }))
      : [createDraftSet()],
  };
}

function createDraftId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toOptionalInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function toOptionalDecimal(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 10) / 10) : null;
}

function sanitizeIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function sanitizeDecimalInput(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = normalized.split('.');
  if (!rest.length) {
    return whole;
  }
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

function swapItems<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (!item) {
    return list;
  }
  next.splice(to, 0, item);
  return next;
}

async function assignRoutineToGroup(groupId: string, groupName: string, routineId: string): Promise<void> {
  const storedValue = await AsyncStorage.getItem(WORKOUT_GROUP_STORAGE_KEY);
  const existing = parseStoredGroups(storedValue) ?? [];

  let found = false;
  const next = existing.map((group) => {
    const filteredIds = group.routineIds.filter((id) => id !== routineId);
    if (group.id !== groupId) {
      return { ...group, routineIds: filteredIds };
    }
    found = true;
    return { ...group, name: group.name || groupName, routineIds: [routineId, ...filteredIds] };
  });

  if (!found) {
    next.push({ id: groupId, name: groupName, routineIds: [routineId] });
  }

  await AsyncStorage.setItem(WORKOUT_GROUP_STORAGE_KEY, JSON.stringify(next));
}

async function removeRoutineFromGroups(routineId: string): Promise<void> {
  const storedValue = await AsyncStorage.getItem(WORKOUT_GROUP_STORAGE_KEY);
  const existing = parseStoredGroups(storedValue);
  if (!existing?.length) {
    return;
  }
  const next = existing.map((group) => ({
    ...group,
    routineIds: group.routineIds.filter((id) => id !== routineId),
  }));
  await AsyncStorage.setItem(WORKOUT_GROUP_STORAGE_KEY, JSON.stringify(next));
}

function parseStoredGroups(value: string | null): WorkoutGroupStorage[] | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed
      .filter((item): item is WorkoutGroupStorage => typeof item?.id === 'string' && typeof item?.name === 'string' && Array.isArray(item?.routineIds))
      .map((item) => ({
        id: item.id,
        name: item.name,
        routineIds: item.routineIds.filter((id): id is string => typeof id === 'string'),
      }));
  } catch {
    return null;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function IconButton({
  icon: Icon,
  onPress,
  disabled,
  tone = 'default',
}: {
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          borderColor: tone === 'danger' ? withAlpha(theme.colors.danger, 0.45) : withAlpha(theme.colors.border, 0.96),
          backgroundColor: tone === 'danger' ? withAlpha(theme.colors.danger, 0.08) : withAlpha(theme.colors.surfaceAlt, 0.7),
          opacity: disabled ? 0.4 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <Icon size={14} color={tone === 'danger' ? theme.colors.danger : theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  root: {
    flex: 1,
    position: 'relative',
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 20,
    paddingTop: 4,
  },
  headerShell: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 10,
  },
  headerGhostButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 66,
    paddingHorizontal: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 72,
    paddingHorizontal: 10,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    gap: 2,
  },
  spaceBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldShell: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  input: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 42,
    paddingHorizontal: 11,
  },
  notesInput: {
    minHeight: 88,
    paddingTop: 10,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  addExerciseButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  exerciseCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 11,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  exerciseAccent: {
    borderRadius: 999,
    height: 6,
    left: 12,
    position: 'absolute',
    top: 0,
    width: 52,
  },
  exerciseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  exerciseCopy: {
    flex: 1,
    gap: 4,
  },
  exerciseMetaTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  exerciseIndexPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  exerciseTitle: {
    fontSize: 18,
  },
  exerciseActionRow: {
    flexDirection: 'row',
    gap: 5,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  setsShell: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  setHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 20,
    paddingHorizontal: 2,
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
  },
  setIndexCol: {
    width: 38,
  },
  setInputCol: {
    flex: 1,
  },
  setActionCol: {
    width: 28,
  },
  setIndexPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  setIndexText: {
    textAlign: 'center',
  },
  setInput: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 32,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
  setRemoveButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  addSetButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 34,
  },
  emptyExercisesState: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  emptyCopy: {
    flex: 1,
    gap: 2,
  },
  emptyAddPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
