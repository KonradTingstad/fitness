import { BarChart, LineChart } from 'react-native-gifted-charts';

import { ProgressChartPoint, ProgressWidgetChartType } from '@/features/progress/widgets/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  points: ProgressChartPoint[];
  chartType: ProgressWidgetChartType;
  color?: string;
  height?: number;
}

export function ChartRenderer({ points, chartType, color, height = 170 }: Props) {
  const theme = useAppTheme();
  const chartColor = color ?? theme.colors.primary;
  const data = points.map((point) => ({ value: point.value, label: point.label }));

  if (chartType === 'line') {
    return (
      <LineChart
        data={data}
        height={height}
        curved
        color={chartColor}
        noOfSections={4}
        yAxisTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
        rulesColor={theme.colors.border}
        yAxisColor={theme.colors.border}
        xAxisColor={theme.colors.border}
      />
    );
  }

  return (
    <BarChart
      data={data}
      height={height}
      barWidth={20}
      spacing={12}
      frontColor={chartColor}
      yAxisTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
      xAxisLabelTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
      rulesColor={theme.colors.border}
      yAxisColor={theme.colors.border}
      xAxisColor={theme.colors.border}
    />
  );
}
