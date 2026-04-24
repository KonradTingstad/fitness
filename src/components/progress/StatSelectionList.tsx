import { BarChart3, ChevronRight, LineChart } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ProgressMetricDefinition } from '@/features/progress/widgets/catalog';
import { ProgressWidgetMetric } from '@/features/progress/widgets/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  title: string;
  items: ProgressMetricDefinition[];
  onSelect: (metric: ProgressWidgetMetric) => void;
}

export function StatSelectionList({ title, items, onSelect }: Props) {
  const theme = useAppTheme();

  if (!items.length) {
    return null;
  }

  return (
    <View style={styles.section}>
      <AppText variant="section">{title}</AppText>
      <Card style={styles.card}>
        {items.map((item, index) => {
          const Icon = item.defaultChartType === 'line' ? LineChart : BarChart3;
          return (
            <Pressable
              key={item.metric}
              onPress={() => onSelect(item.metric)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                { opacity: pressed ? 0.84 : 1 },
              ]}
            >
              <View style={styles.left}>
                <Icon size={16} color={theme.colors.primary} />
                <View style={styles.copy}>
                  <AppText weight="800">{item.title}</AppText>
                  <AppText muted variant="small">
                    {item.subtitle}
                  </AppText>
                </View>
              </View>
              <ChevronRight size={18} color={theme.colors.muted} />
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  card: {
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 12,
  },
  left: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
});
