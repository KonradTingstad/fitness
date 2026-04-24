import { Activity, Dumbbell, Pencil, Scale, Soup, Trash2 } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ChartRenderer } from '@/components/progress/ChartRenderer';
import { CATEGORY_LABELS, TIME_RANGE_LABELS, getMetricDefinition } from '@/features/progress/widgets/catalog';
import { ProgressWidgetConfig, ProgressWidgetSeries } from '@/features/progress/widgets/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  widget: ProgressWidgetConfig;
  series: ProgressWidgetSeries;
  onEdit: () => void;
  onDelete: () => void;
}

function formatMetricValue(value: number): string {
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toString();
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

export function ProgressChartCard({ widget, series, onEdit, onDelete }: Props) {
  const theme = useAppTheme();
  const definition = getMetricDefinition(widget.metric);
  const icon =
    widget.type === 'body'
      ? Scale
      : widget.type === 'nutrition'
        ? Soup
        : widget.type === 'training'
          ? Dumbbell
          : Activity;
  const color =
    widget.type === 'body'
      ? theme.colors.warning
      : widget.type === 'nutrition'
        ? theme.colors.info
        : widget.type === 'training'
          ? theme.colors.primary
          : theme.colors.accent;
  const Icon = icon;
  const latestValue = series.latestValue != null ? `${formatMetricValue(series.latestValue)} ${widget.unit ?? ''}`.trim() : '--';
  const delta =
    series.changeFromStart == null
      ? '--'
      : `${series.changeFromStart > 0 ? '+' : ''}${formatMetricValue(series.changeFromStart)} ${widget.unit ?? ''}`.trim();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Icon size={17} color={color} />
          </View>
          <View style={styles.copy}>
            <AppText variant="section">{definition.title}</AppText>
            <AppText muted variant="small">
              {CATEGORY_LABELS[widget.type]} • {TIME_RANGE_LABELS[widget.timeRange]}
            </AppText>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onEdit} hitSlop={12}>
            <Pencil size={18} color={theme.colors.muted} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={12}>
            <Trash2 size={18} color={theme.colors.muted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricItem}>
          <AppText muted variant="small">Latest</AppText>
          <AppText weight="800">{latestValue}</AppText>
        </View>
        <View style={styles.metricItem}>
          <AppText muted variant="small">Change</AppText>
          <AppText weight="800" style={{ color: series.changeFromStart && series.changeFromStart > 0 ? theme.colors.primary : theme.colors.text }}>
            {delta}
          </AppText>
        </View>
      </View>

      {series.points.length ? (
        <ChartRenderer points={series.points} chartType={widget.chartType} color={color} />
      ) : (
        <View style={[styles.empty, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText muted>{series.emptyMessage ?? 'Log more data to see this chart'}</AppText>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 8,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  metricItem: {
    flex: 1,
    gap: 2,
  },
  empty: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 140,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
