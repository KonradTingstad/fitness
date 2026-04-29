import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format, isToday, parseISO } from 'date-fns';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

type Props = {
  localDate: string;
  onChange: (nextLocalDate: string) => void;
  hint?: boolean;
};

function shiftLocalDate(localDate: string, days: number): string {
  const date = parseISO(`${localDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return format(date, 'yyyy-MM-dd');
}

function labelForDate(localDate: string): string {
  const date = parseISO(`${localDate}T00:00:00`);
  return isToday(date) ? `Today, ${format(date, 'EEE d MMM')}` : format(date, 'EEE, d MMM');
}

export function DateNavigator({ localDate, onChange, hint = false }: Props) {
  const theme = useAppTheme();
  const hintShownRef = useRef(false);
  const shouldShowHint = hint && !hintShownRef.current;
  if (shouldShowHint) hintShownRef.current = true;

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
        <AppText weight="700" style={{ color: theme.colors.text }}>
          {labelForDate(localDate)}
        </AppText>
        <Pressable onPress={() => onChange(shiftLocalDate(localDate, 1))} style={styles.iconButton} hitSlop={8}>
          <ChevronRight size={18} color={theme.colors.text} />
        </Pressable>
      </View>
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
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { textAlign: 'center', marginTop: 4, opacity: 0.7 },
});
