import { RouteProp, useRoute } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StatPill } from '@/components/StatPill';
import { estimatedOneRepMax } from '@/domain/calculations/workout';
import { useExerciseHistory } from '@/hooks/useAppQueries';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';
import { Dumbbell } from 'lucide-react-native';

type Route = RouteProp<RootStackParamList, 'ExerciseHistory'>;

export function ExerciseHistoryScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const history = useExerciseHistory(route.params.exerciseId);

  if (history.isLoading || !history.data) {
    return <LoadingState label="Loading exercise history" />;
  }

  const chartData = history.data.volumeBySession.map((item) => ({ value: item.value, label: item.label }));
  const best = history.data.bestSet;

  return (
    <Screen>
      <Card>
        <AppText variant="title">{history.data.exercise.name}</AppText>
        <AppText muted>{history.data.exercise.primaryMuscle} • {history.data.exercise.equipment}</AppText>
        {history.data.exercise.instructions ? <AppText muted>{history.data.exercise.instructions}</AppText> : null}
      </Card>

      {best ? (
        <View style={styles.grid}>
          <StatPill label="Best set" value={`${best.weightKg ?? 0} x ${best.reps ?? 0}`} tone="good" />
          <StatPill label="Est. 1RM" value={`${estimatedOneRepMax(best.weightKg ?? 0, best.reps ?? 0)} kg`} tone="info" />
        </View>
      ) : null}

      <Card>
        <AppText variant="section">Volume trend</AppText>
        {chartData.length ? (
          <LineChart
            data={chartData}
            height={180}
            areaChart
            curved
            color={theme.colors.primary}
            startFillColor={theme.colors.primary}
            startOpacity={0.25}
            endOpacity={0}
            noOfSections={4}
            hideDataPoints={false}
            yAxisTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: theme.colors.muted, fontSize: 10 }}
            rulesColor={theme.colors.border}
            yAxisColor={theme.colors.border}
            xAxisColor={theme.colors.border}
          />
        ) : (
          <EmptyState icon={Dumbbell} title="No history yet" body="Completed sets for this exercise will show volume and strength trends." />
        )}
      </Card>

      <Card>
        <AppText variant="section">Recent sets</AppText>
        {history.data.sets.slice(0, 8).map((set) => (
          <View key={set.id} style={styles.row}>
            <AppText weight="800">{set.weightKg ?? 0} kg x {set.reps ?? 0}</AppText>
            <AppText muted>{set.completedAt ? new Date(set.completedAt).toLocaleDateString() : 'Draft'}</AppText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
});
