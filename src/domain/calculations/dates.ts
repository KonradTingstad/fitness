import { addDays, format, parseISO, startOfDay, subDays } from 'date-fns';

export const LOCAL_DAY_FORMAT = 'yyyy-MM-dd';

export function toLocalDateKey(date = new Date()): string {
  return format(date, LOCAL_DAY_FORMAT);
}

export function shiftLocalDate(localDate: string, days: number): string {
  return format(addDays(parseISO(`${localDate}T00:00:00`), days), LOCAL_DAY_FORMAT);
}

export function lastNDays(count: number, end = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = subDays(startOfDay(end), count - index - 1);
    return format(date, LOCAL_DAY_FORMAT);
  });
}
