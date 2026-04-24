import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

interface Props {
  label?: string;
  value: number;
  max: number;
  color?: string;
  detail?: string;
}

export function ProgressBar({ label, value, max, color, detail }: Props) {
  const theme = useAppTheme();
  const percent = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const fill = color ?? (value > max ? theme.colors.danger : theme.colors.primary);
  return (
    <View style={styles.wrap}>
      {(label || detail) && (
        <View style={styles.row}>
          {label ? <AppText weight="700">{label}</AppText> : <View />}
          {detail ? <AppText muted variant="small">{detail}</AppText> : null}
        </View>
      )}
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.fill, { backgroundColor: fill, width: `${percent * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 7,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
});
