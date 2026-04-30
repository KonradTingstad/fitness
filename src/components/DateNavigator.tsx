import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react-native';
import { addDays, addMonths, endOfMonth, format, isToday, parseISO, startOfMonth } from 'date-fns';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

type Props = {
  localDate: string;
  onChange: (nextLocalDate: string) => void;
  hint?: boolean;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftLocalDate(localDate: string, days: number): string {
  const date = parseISO(`${localDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return format(date, 'yyyy-MM-dd');
}

function labelForDate(localDate: string): string {
  const date = parseISO(`${localDate}T00:00:00`);
  return isToday(date) ? `Today, ${format(date, 'EEE d MMM')}` : format(date, 'EEE, d MMM');
}

function buildMonthCalendarDays(month: Date): Array<Date | null> {
  const firstDay = startOfMonth(month);
  const lastDay = endOfMonth(month);
  const leading = (firstDay.getDay() + 6) % 7;
  const days: Array<Date | null> = [];

  for (let index = 0; index < leading; index += 1) {
    days.push(null);
  }

  for (let day = 0; day < lastDay.getDate(); day += 1) {
    days.push(addDays(firstDay, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

export function DateNavigator({ localDate, onChange, hint = false }: Props) {
  const theme = useAppTheme();
  const hintShownRef = useRef(false);
  const selectedDate = useMemo(() => parseISO(`${localDate}T00:00:00`), [localDate]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(selectedDate));
  const shouldShowHint = hint && !hintShownRef.current;
  if (shouldShowHint) hintShownRef.current = true;

  useEffect(() => {
    setCalendarMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  const monthDays = useMemo(() => buildMonthCalendarDays(calendarMonth), [calendarMonth]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_e, gesture) => {
          if (gesture.dx <= -24) onChange(shiftLocalDate(localDate, 1));
          if (gesture.dx >= 24) onChange(shiftLocalDate(localDate, -1));
        },
      }),
    [localDate, onChange],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { borderColor: theme.colors.border, backgroundColor: 'rgba(18,24,31,0.6)' }]} {...panResponder.panHandlers}>
        <Pressable onPress={() => onChange(shiftLocalDate(localDate, -1))} style={styles.iconButton} hitSlop={8}>
          <ChevronLeft size={18} color={theme.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsCalendarOpen((current) => !current)}
          style={({ pressed }) => [styles.dateTrigger, { opacity: pressed ? 0.78 : 1 }]}
        >
          <CalendarDays size={15} color={theme.colors.muted} />
          <AppText numberOfLines={1} weight="700" style={{ color: theme.colors.text }}>
            {labelForDate(localDate)}
          </AppText>
          {isCalendarOpen ? <ChevronUp size={16} color={theme.colors.muted} /> : <ChevronDown size={16} color={theme.colors.muted} />}
        </Pressable>
        <Pressable onPress={() => onChange(shiftLocalDate(localDate, 1))} style={styles.iconButton} hitSlop={8}>
          <ChevronRight size={18} color={theme.colors.text} />
        </Pressable>
      </View>
      {isCalendarOpen ? (
        <View style={[styles.calendarDropdown, { borderColor: theme.colors.border, backgroundColor: 'rgba(17,22,29,0.94)' }]}>
          <View style={styles.calendarHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
              style={({ pressed }) => [styles.calendarNavButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ChevronLeft size={18} color={theme.colors.text} />
            </Pressable>
            <AppText weight="800">{format(calendarMonth, 'MMMM yyyy')}</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
              style={({ pressed }) => [styles.calendarNavButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ChevronRight size={18} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((day) => (
              <View key={day} style={styles.weekdayCell}>
                <AppText muted variant="small">
                  {day}
                </AppText>
              </View>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthDays.map((date, index) => {
              if (!date) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const dateKey = format(date, 'yyyy-MM-dd');
              const selected = dateKey === localDate;
              const today = isToday(date);
              const dayTextColor = selected ? '#08100C' : theme.colors.text;

              return (
                <Pressable
                  key={dateKey}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(dateKey);
                    setIsCalendarOpen(false);
                  }}
                  style={({ pressed }) => [styles.dayCell, { opacity: pressed ? 0.72 : 1 }]}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      selected
                        ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                        : today
                          ? { borderColor: theme.colors.primary, backgroundColor: 'rgba(58,207,127,0.14)' }
                          : { borderColor: 'transparent' },
                    ]}
                  >
                    <AppText weight={selected ? '800' : '600'} style={{ color: dayTextColor }}>
                      {date.getDate()}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {shouldShowHint ? (
        <AppText muted variant="small" style={styles.hint}>Swipe to change day</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 10 },
  row: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTrigger: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 34,
    paddingHorizontal: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDropdown: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarNavButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 3,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    width: '14.2857%',
  },
  dayCircle: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  hint: { textAlign: 'center', marginTop: 4, opacity: 0.7 },
});
