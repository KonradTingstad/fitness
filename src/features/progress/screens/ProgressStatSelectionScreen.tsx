import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '@/components/Screen';
import { StatSelectionList } from '@/components/progress/StatSelectionList';
import { CATEGORY_LABELS, getMetricsByCategory } from '@/features/progress/widgets/catalog';
import { ProgressWidgetCategory } from '@/features/progress/widgets/types';
import { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProgressStatSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const preferred = (route.params as { category?: ProgressWidgetCategory } | undefined)?.category;

  const categories: ProgressWidgetCategory[] = ['body', 'nutrition', 'training', 'exercise'];
  const ordered = preferred
    ? [preferred, ...categories.filter((item) => item !== preferred)]
    : categories;

  return (
    <Screen>
      {ordered.map((category) => (
        <StatSelectionList
          key={category}
          title={CATEGORY_LABELS[category]}
          items={getMetricsByCategory(category)}
          onSelect={(metric) => navigation.navigate('ProgressStatConfig', { metricId: metric })}
        />
      ))}
    </Screen>
  );
}
