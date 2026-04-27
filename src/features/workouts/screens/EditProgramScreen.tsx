import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { Calendar, Check, ChevronLeft, ChevronRight, Circle, Clock, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
import { ProgramActivityIcon } from '@/features/workouts/components/ProgramActivityIcon';
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
  const activeDays = useMemo(() => weekDays.filter((day) => day.activityType !== 'rest').length, [weekDays]);

  const weekLabel = useMemo(() => `Week ${format(weekStart, 'w')}`, [weekStart]);
  const weekRangeLabel = useMemo(() => `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}`, [weekEnd, weekStart]);
  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  const shiftWeek = (direction: -1 | 1) => {
    animateLayout();
    setWeekStart((current) => addDays(current, direction * 7));
  };

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
      animateLayout();
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
        <View pointerEvents="none" style={[styles.weekGlowLarge, { backgroundColor: withAlpha(theme.colors.primary, 0.2) }]} />
        <View pointerEvents="none" style={[styles.weekGlowSmall, { backgroundColor: withAlpha(theme.colors.info, 0.18) }]} />

        <View style={[styles.weekBadge, { borderColor: withAlpha(theme.colors.primary, 0.45), backgroundColor: withAlpha(theme.colors.primary, 0.12) }]}>
          <Calendar size={13} color={theme.colors.primary} />
          <AppText variant="small" weight="700" style={{ color: theme.colors.primary }}>
            Currently editing
          </AppText>
        </View>

        <View style={styles.weekTopRow}>
          <View style={styles.weekCopy}>
            <AppText variant="section">{weekLabel}</AppText>
            <AppText variant="title" style={styles.weekRangeText}>
              {weekRangeLabel}
            </AppText>
            <AppText muted variant="small">
              {activeDays} active days planned • {summary.rest} recovery/rest days
            </AppText>
          </View>
        </View>

        <View style={styles.weekActions}>
          <Pressable
            onPress={() => shiftWeek(-1)}
            style={({ pressed }) => [
              styles.weekNavButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <ChevronLeft size={18} color={theme.colors.text} />
          </Pressable>

          <View style={[styles.weekRangeBadge, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.9) }]}>
            <AppText muted variant="small">
              Tap day to assign activity
            </AppText>
          </View>

          <Pressable
            onPress={() => shiftWeek(1)}
            style={({ pressed }) => [
              styles.weekNavButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                opacity: pressed ? 0.78 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <ChevronRight size={18} color={theme.colors.text} />
          </Pressable>
        </View>
      </Card>

      <Card style={styles.daysCard}>
        <View style={styles.daysHeader}>
          <AppText variant="section">Weekly assignments</AppText>
          <AppText muted variant="small">
            Tap any day to edit
          </AppText>
        </View>
        {weekDays.map((day, index) => {
          const icon = activityVisual(
            day.activityType,
            theme.colors.primary,
            theme.colors.warning,
            theme.colors.info,
            theme.colors.muted,
            theme.colors.accent,
          );
          const tone = activityTone(
            day.activityType,
            theme.colors.primary,
            theme.colors.warning,
            theme.colors.info,
            theme.colors.muted,
            theme.colors.accent,
          );
          return (
            <Pressable
              key={day.localDate}
              onPress={() => {
                animateLayout();
                setEditingDay(day);
              }}
              style={({ pressed }) => [
                styles.dayRow,
                {
                  borderColor: withAlpha(tone.accent, 0.45),
                  backgroundColor: withAlpha(tone.accent, 0.09),
                  marginTop: index === 0 ? 0 : 8,
                  opacity: pressed ? 0.82 : 1,
                  transform: [{ scale: pressed ? 0.988 : 1 }],
                },
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

              <View style={[styles.dayAccent, { backgroundColor: withAlpha(tone.accent, 0.7) }]} />

              <View style={styles.dayActivityCol}>
                <View style={[styles.activityIconWrap, { borderColor: withAlpha(tone.accent, 0.55), backgroundColor: withAlpha(tone.accent, 0.16) }]}>
                  {icon}
                </View>
                <View style={styles.dayActivityCopy}>
                  <View style={styles.dayTitleRow}>
                    <AppText weight="800" numberOfLines={1} style={styles.dayTitle}>
                      {day.title}
                    </AppText>
                    <View style={[styles.activityTypePill, { borderColor: withAlpha(tone.accent, 0.45), backgroundColor: withAlpha(tone.accent, 0.15) }]}>
                      <AppText variant="small" weight="700" style={{ color: tone.accent }}>
                        {tone.label}
                      </AppText>
                    </View>
                  </View>

                  <AppText muted variant="small" numberOfLines={1}>
                    {day.subtitle}
                  </AppText>

                  <View style={styles.dayMetaRow}>
                    <View style={[styles.dayMetaPill, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surface, 0.75) }]}>
                      <Clock size={11} color={theme.colors.muted} />
                      <AppText muted variant="small">
                        {day.estimatedDurationMinutes > 0 ? `~${day.estimatedDurationMinutes} min` : 'Recovery focus'}
                      </AppText>
                    </View>
                    {day.activityType === 'strength' ? (
                      <View style={[styles.dayMetaPill, { borderColor: withAlpha(theme.colors.primary, 0.45), backgroundColor: withAlpha(theme.colors.primary, 0.12) }]}>
                        <AppText variant="small" weight="700" style={{ color: theme.colors.primary }}>
                          {day.exerciseCount} exercises
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={[styles.dayChevronWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <ChevronRight size={16} color={theme.colors.muted} />
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryHeaderCopy}>
            <AppText variant="section">Program summary</AppText>
            <AppText muted variant="small">
              Snapshot for {weekRangeLabel}
            </AppText>
          </View>
          <View style={[styles.summaryCalendarWrap, { borderColor: theme.colors.border, backgroundColor: withAlpha(theme.colors.surfaceAlt, 0.82) }]}>
            <Calendar size={16} color={theme.colors.muted} />
          </View>
        </View>
        <View style={styles.summaryRow}>
          <SummaryMetric label="Strength" value={summary.strength} activityType="strength" />
          <SummaryMetric label="Cardio" value={summary.cardio} activityType="cardio" />
          <SummaryMetric label="Recovery" value={summary.rest} activityType="rest" />
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

function SummaryMetric({ label, value, activityType }: { label: string; value: number; activityType: ProgramActivityType }) {
  const theme = useAppTheme();
  const tone = activityTone(activityType, theme.colors.primary, theme.colors.warning, theme.colors.info, theme.colors.muted, theme.colors.accent);
  return (
    <View style={[styles.summaryMetric, { borderColor: withAlpha(tone.accent, 0.45), backgroundColor: withAlpha(tone.accent, 0.1) }]}>
      <View style={[styles.summaryMetricIconWrap, { borderColor: withAlpha(tone.accent, 0.45), backgroundColor: withAlpha(tone.accent, 0.14) }]}>
        <ProgramActivityIcon activityType={activityType} color={tone.accent} size={14} />
      </View>
      <AppText muted variant="small" numberOfLines={1}>
        {label}
      </AppText>
      <AppText style={styles.summaryMetricValue} weight="800">
        {value}
      </AppText>
      <AppText muted variant="small">
        days/week
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
  const tone = activityTone(option.activityType, theme.colors.primary, theme.colors.warning, theme.colors.info, theme.colors.muted, theme.colors.accent);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        {
          borderColor: selected ? withAlpha(tone.accent, 0.55) : theme.colors.border,
          backgroundColor: selected ? withAlpha(tone.accent, 0.12) : theme.colors.surfaceAlt,
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={[styles.optionIconWrap, { borderColor: withAlpha(tone.accent, 0.5), backgroundColor: withAlpha(tone.accent, 0.14) }]}>
        {activityVisual(option.activityType, theme.colors.primary, theme.colors.warning, theme.colors.info, theme.colors.muted, theme.colors.accent)}
      </View>
      <View style={styles.optionCopy}>
        <View style={styles.optionTitleRow}>
          <AppText weight="800" numberOfLines={1} style={styles.optionTitle}>
            {option.title}
          </AppText>
          <View style={[styles.optionTypePill, { borderColor: withAlpha(tone.accent, 0.5), backgroundColor: withAlpha(tone.accent, 0.14) }]}>
            <AppText variant="small" weight="700" style={{ color: tone.accent }}>
              {tone.label}
            </AppText>
          </View>
        </View>
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

function activityVisual(activityType: ProgramActivityType, primary: string, warning: string, info: string, muted: string, accent: string) {
  const { accent: color } = activityTone(activityType, primary, warning, info, muted, accent);
  return <ProgramActivityIcon activityType={activityType} color={color} size={16} />;
}

function activityTone(
  activityType: ProgramActivityType,
  primary: string,
  warning: string,
  info: string,
  muted: string,
  accent: string,
): { accent: string; label: string } {
  if (activityType === 'cardio') {
    return { accent: warning, label: 'Cardio' };
  }
  if (activityType === 'padel') {
    return { accent: info, label: 'Padel' };
  }
  if (activityType === 'golf') {
    return { accent, label: 'Golf' };
  }
  if (activityType === 'rest') {
    return { accent: muted, label: 'Rest' };
  }
  if (activityType === 'recovery') {
    return { accent: primary, label: 'Recovery' };
  }
  return { accent: primary, label: 'Strength' };
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
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    paddingBottom: 14,
  },
  weekGlowLarge: {
    borderRadius: 999,
    height: 180,
    position: 'absolute',
    right: -72,
    top: -76,
    width: 180,
  },
  weekGlowSmall: {
    borderRadius: 999,
    height: 112,
    left: -36,
    position: 'absolute',
    top: 34,
    width: 112,
  },
  weekBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 24,
    paddingHorizontal: 10,
  },
  weekRangeText: {
    fontSize: 24,
    lineHeight: 28,
  },
  weekTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  weekCopy: {
    flex: 1,
    gap: 4,
  },
  weekActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  weekNavButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  weekRangeBadge: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  daysCard: {
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  daysHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dayDateCol: {
    minWidth: 58,
  },
  dayName: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  dayAccent: {
    borderRadius: 999,
    height: '84%',
    width: 2,
  },
  dayActivityCol: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
  },
  activityIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dayActivityCopy: {
    flex: 1,
    gap: 4,
  },
  dayTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dayTitle: {
    flex: 1,
  },
  activityTypePill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 18,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  dayMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayMetaPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 18,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dayChevronWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  summaryCard: {
    gap: 10,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  summaryCalendarWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryMetric: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryMetricIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  summaryMetricValue: {
    fontSize: 22,
    lineHeight: 24,
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
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  optionTitle: {
    flex: 1,
  },
  optionTypePill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 18,
    justifyContent: 'center',
    paddingHorizontal: 7,
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
