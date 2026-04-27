import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { Calendar, Check, ChevronLeft, ChevronRight, Circle, Dumbbell, Flag, Heart, Minus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import {
  ProgramActivityType,
  ProgramScheduleDay,
  UpsertProgramScheduleDayInput,
  upsertProgramScheduleDay,
} from '@/data/repositories/workoutRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { useProgramScheduleForRange, useRoutines } from '@/hooks/useAppQueries';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'EditProgram'>;

type ActivityOption = {
  key: string;
  activityType: ProgramActivityType;
  title: string;
  subtitle: string;
  estimatedDurationMinutes: number;
  routineId?: string | null;
};

const OTHER_ACTIVITY_OPTIONS: ActivityOption[] = [
  {
    key: 'cardio',
    activityType: 'cardio',
    title: 'Cardio',
    subtitle: 'Moderate · ~30–45 min',
    estimatedDurationMinutes: 40,
  },
  {
    key: 'padel',
    activityType: 'padel',
    title: 'Padel',
    subtitle: 'Match / Training',
    estimatedDurationMinutes: 60,
  },
  {
    key: 'golf',
    activityType: 'golf',
    title: 'Golf',
    subtitle: '18 holes / Practice',
    estimatedDurationMinutes: 120,
  },
  {
    key: 'rest',
    activityType: 'rest',
    title: 'Rest day',
    subtitle: 'Recovery',
    estimatedDurationMinutes: 0,
  },
  {
    key: 'recovery',
    activityType: 'recovery',
    title: 'Active recovery',
    subtitle: 'Mobility / Light walk',
    estimatedDurationMinutes: 30,
  },
];

export function EditProgramScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(parseInitialDate(route.params?.initialLocalDate), { weekStartsOn: 1 }));
  const [editingDay, setEditingDay] = useState<ProgramScheduleDay | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartKey = toLocalDateKey(weekStart);
  const weekEndKey = toLocalDateKey(weekEnd);

  const routines = useRoutines();
  const schedule = useProgramScheduleForRange(weekStartKey, weekEndKey);

  const saveProgramDay = useMutation({
    mutationFn: (input: UpsertProgramScheduleDayInput) => upsertProgramScheduleDay(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'programSchedule',
      });
    },
  });

  const strengthOptions = useMemo<ActivityOption[]>(() => {
    const routineList = routines.data ?? [];
    return routineList.map((routine) => {
      const exerciseCount = routine.exercises.length;
      const estimatedDurationMinutes = Math.max(30, exerciseCount * 12);
      return {
        key: `routine_${routine.id}`,
        activityType: 'strength',
        title: routine.name,
        subtitle: `${exerciseCount} exercises · ~${estimatedDurationMinutes} min`,
        routineId: routine.id,
        estimatedDurationMinutes,
      };
    });
  }, [routines.data]);

  const weekDays = schedule.data ?? [];

  const summary = useMemo(() => {
    return {
      strength: weekDays.filter((day) => day.activityType === 'strength').length,
      cardio: weekDays.filter((day) => day.activityType === 'cardio').length,
      rest: weekDays.filter((day) => day.activityType === 'rest' || day.activityType === 'recovery').length,
    };
  }, [weekDays]);

  const weekLabel = useMemo(() => `Week ${format(weekStart, 'w')}`, [weekStart]);
  const weekRangeLabel = useMemo(() => `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}`, [weekEnd, weekStart]);

  const handleSelectActivity = async (option: ActivityOption) => {
    if (!editingDay) {
      return;
    }
    try {
      await saveProgramDay.mutateAsync({
        localDate: editingDay.localDate,
        activityType: option.activityType,
        title: option.title,
        subtitle: option.subtitle,
        routineId: option.activityType === 'strength' ? option.routineId ?? null : null,
        estimatedDurationMinutes: option.estimatedDurationMinutes,
      });
      setEditingDay(null);
    } catch (error) {
      Alert.alert('Save program', error instanceof Error ? error.message : 'Unable to update day activity.');
    }
  };

  if (schedule.isLoading || routines.isLoading) {
    return <LoadingState label="Loading program editor" />;
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.82 : 1 }]}
        >
          <ChevronLeft size={18} color={theme.colors.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <AppText variant="title">Edit program</AppText>
          <AppText muted>Customize your weekly plan.</AppText>
        </View>

        <Button
          label="Templates"
          variant="secondary"
          onPress={() => Alert.alert('Templates', 'Template shortcuts can be added here.')}
          style={styles.templatesButton}
        />
      </View>

      <Card style={styles.weekCard}>
        <View style={styles.weekTopRow}>
          <View style={styles.weekCopy}>
            <AppText variant="section">{weekLabel}</AppText>
            <AppText muted>{weekRangeLabel}</AppText>
          </View>
          <View style={styles.weekActions}>
            <Pressable
              onPress={() => setWeekStart((current) => addDays(current, -7))}
              style={({ pressed }) => [styles.weekNavButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.78 : 1 }]}
            >
              <ChevronLeft size={18} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() => setWeekStart((current) => addDays(current, 7))}
              style={({ pressed }) => [styles.weekNavButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.78 : 1 }]}
            >
              <ChevronRight size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </Card>

      <Card style={styles.daysCard}>
        {weekDays.map((day, index) => {
          const icon = activityVisual(day.activityType, theme.colors.primary, theme.colors.warning, theme.colors.info, theme.colors.muted);
          return (
            <Pressable
              key={day.localDate}
              onPress={() => setEditingDay(day)}
              style={({ pressed }) => [
                styles.dayRow,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
                { opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <View style={styles.dayDateCol}>
                <AppText weight="800" style={styles.dayName}>
                  {formatLocalDate(day.localDate, 'EEE')}
                </AppText>
                <AppText muted variant="small">
                  {formatLocalDate(day.localDate, 'd MMM')}
                </AppText>
              </View>

              <View style={styles.dayActivityCol}>
                <View style={[styles.activityIconWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                  {icon}
                </View>
                <View style={styles.dayActivityCopy}>
                  <AppText weight="800">{day.title}</AppText>
                  <AppText muted variant="small" numberOfLines={1}>
                    {day.subtitle}
                  </AppText>
                </View>
              </View>

              <ChevronRight size={18} color={theme.colors.muted} />
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <View style={styles.summaryHeader}>
          <AppText variant="section">Program summary</AppText>
          <Calendar size={16} color={theme.colors.muted} />
        </View>
        <View style={styles.summaryRow}>
          <SummaryMetric label="Workouts" value={summary.strength} />
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <SummaryMetric label="Cardio" value={summary.cardio} />
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <SummaryMetric label="Rest days" value={summary.rest} />
        </View>
      </Card>

      <ActivityPickerSheet
        visible={Boolean(editingDay)}
        day={editingDay}
        strengthOptions={strengthOptions}
        otherOptions={OTHER_ACTIVITY_OPTIONS}
        saving={saveProgramDay.isPending}
        onClose={() => setEditingDay(null)}
        onSelect={handleSelectActivity}
      />
    </Screen>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryMetric}>
      <AppText muted variant="small">
        {label}
      </AppText>
      <AppText variant="metric" weight="800">
        {value}
      </AppText>
      <AppText muted variant="small">
        per week
      </AppText>
    </View>
  );
}

function ActivityPickerSheet({
  visible,
  day,
  strengthOptions,
  otherOptions,
  saving,
  onClose,
  onSelect,
}: {
  visible: boolean;
  day: ProgramScheduleDay | null;
  strengthOptions: ActivityOption[];
  otherOptions: ActivityOption[];
  saving: boolean;
  onClose: () => void;
  onSelect: (option: ActivityOption) => void;
}) {
  const theme = useAppTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <View style={[styles.modalSheet, { borderColor: theme.colors.border, backgroundColor: 'rgba(18,23,31,0.98)' }]}>
          <View style={styles.modalHandleWrap}>
            <View style={[styles.modalHandle, { backgroundColor: theme.colors.border }]} />
          </View>

          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderCopy}>
              <AppText variant="section">Choose activity</AppText>
              <AppText muted>
                {day ? `Select what you want to do on ${formatLocalDate(day.localDate, 'EEE, d MMM')}` : 'Select activity'}
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.modalCloseButton, { borderColor: theme.colors.border, opacity: pressed ? 0.82 : 1 }]}
            >
              <X size={16} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <SectionLabel title="Strength" />
            {strengthOptions.length ? (
              strengthOptions.map((option) => (
                <ActivityOptionRow
                  key={option.key}
                  option={option}
                  selected={isOptionSelected(day, option)}
                  disabled={saving}
                  onPress={() => onSelect(option)}
                />
              ))
            ) : (
              <View style={[styles.emptyStrength, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText muted>No saved workouts yet.</AppText>
              </View>
            )}

            <SectionLabel title="Other" />
            {otherOptions.map((option) => (
              <ActivityOptionRow
                key={option.key}
                option={option}
                selected={isOptionSelected(day, option)}
                disabled={saving}
                onPress={() => onSelect(option)}
              />
            ))}
          </ScrollView>

          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function ActivityOptionRow({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: ActivityOption;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: disabled ? 0.55 : pressed ? 0.82 : 1 },
      ]}
    >
      <View style={[styles.optionIconWrap, { borderColor: theme.colors.border }]}> 
        {activityVisual(option.activityType, theme.colors.primary, theme.colors.warning, theme.colors.info, theme.colors.muted)}
      </View>
      <View style={styles.optionCopy}>
        <AppText weight="800">{option.title}</AppText>
        <AppText muted variant="small">
          {option.subtitle}
        </AppText>
      </View>
      <View
        style={[
          styles.optionCheck,
          {
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            backgroundColor: selected ? 'rgba(53,199,122,0.2)' : 'transparent',
          },
        ]}
      >
        {selected ? <Check size={15} color={theme.colors.primary} /> : <Circle size={15} color={theme.colors.muted} />}
      </View>
    </Pressable>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <AppText muted variant="small" style={styles.sectionLabel}>
      {title.toUpperCase()}
    </AppText>
  );
}

function isOptionSelected(day: ProgramScheduleDay | null, option: ActivityOption): boolean {
  if (!day) {
    return false;
  }
  if (option.activityType !== day.activityType) {
    return false;
  }
  if (option.activityType === 'strength') {
    return day.routineId != null && option.routineId === day.routineId;
  }
  return true;
}

function parseInitialDate(localDate?: string): Date {
  if (!localDate) {
    return new Date();
  }
  const parsed = new Date(`${localDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatLocalDate(localDate: string, pattern: string): string {
  return format(new Date(`${localDate}T00:00:00`), pattern);
}

function activityVisual(activityType: ProgramActivityType, primary: string, warning: string, info: string, muted: string) {
  if (activityType === 'strength') {
    return <Dumbbell size={16} color={primary} />;
  }
  if (activityType === 'cardio') {
    return <Heart size={16} color={warning} />;
  }
  if (activityType === 'padel') {
    return <Circle size={16} color={info} />;
  }
  if (activityType === 'golf') {
    return <Flag size={16} color={primary} />;
  }
  if (activityType === 'recovery') {
    return <Circle size={16} color={primary} />;
  }
  return <Minus size={16} color={muted} />;
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  templatesButton: {
    minHeight: 34,
    paddingHorizontal: 10,
  },
  weekCard: {
    gap: 10,
  },
  weekTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekCopy: {
    gap: 3,
  },
  weekActions: {
    flexDirection: 'row',
    gap: 8,
  },
  weekNavButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  daysCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  dayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dayDateCol: {
    minWidth: 54,
  },
  dayName: {
    fontSize: 14,
  },
  dayActivityCol: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  activityIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  dayActivityCopy: {
    flex: 1,
    gap: 2,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 8,
  },
  summaryMetric: {
    flex: 1,
    gap: 3,
  },
  summaryDivider: {
    height: 54,
    width: StyleSheet.hairlineWidth,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,10,14,0.52)',
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '86%',
    minHeight: '64%',
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  modalHandleWrap: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  modalHandle: {
    borderRadius: 999,
    height: 4,
    width: 46,
  },
  modalHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  modalCloseButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  modalContent: {
    gap: 8,
    paddingBottom: 12,
    paddingTop: 12,
  },
  sectionLabel: {
    marginTop: 8,
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionCheck: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  emptyStrength: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 50,
    justifyContent: 'center',
  },
});
