import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Dumbbell, Utensils } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StatPill } from '@/components/StatPill';
import { getWorkoutSummary } from '@/data/repositories/workoutRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { useQuery } from '@tanstack/react-query';
import { RootStackParamList } from '@/navigation/types';

type Route = RouteProp<RootStackParamList, 'WorkoutSummary'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutSummaryScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const summary = useQuery({
    queryKey: ['workoutSummary', route.params.sessionId],
    queryFn: () => getWorkoutSummary(route.params.sessionId),
  });

  if (summary.isLoading || !summary.data) {
    return <LoadingState label="Summarizing workout" />;
  }

  const minutes = Math.round(summary.data.durationSeconds / 60);

  return (
    <Screen>
      <Card>
        <View style={styles.titleRow}>
          <View>
            <AppText variant="title">{summary.data.session.title}</AppText>
            <AppText muted>{new Date(summary.data.session.startedAt).toLocaleString()}</AppText>
          </View>
          <Dumbbell size={26} />
        </View>
        <View style={styles.grid}>
          <StatPill label="Duration" value={`${minutes}m`} tone="info" />
          <StatPill label="Sets" value={`${summary.data.completedSets}/${summary.data.totalSets}`} tone="good" />
          <StatPill label="Reps" value={`${summary.data.totalReps}`} tone="default" />
        </View>
        <StatPill label="Volume" value={`${Math.round(summary.data.totalVolumeKg)} kg`} tone="good" />
      </Card>

      <Card>
        <AppText variant="section">Exercises completed</AppText>
        {summary.data.session.exercises.map((exercise) => (
          <View key={exercise.id} style={styles.exerciseRow}>
            <AppText weight="800">{exercise.exercise?.name}</AppText>
            <AppText muted>{exercise.sets.filter((set) => set.isCompleted).length} sets</AppText>
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="section">PRs</AppText>
        {summary.data.prs.length ? (
          summary.data.prs.map((pr, index) => (
            <View key={`${pr.label}-${index}`} style={styles.exerciseRow}>
              <AppText weight="800">{pr.label}</AppText>
              <AppText muted>{pr.value}</AppText>
            </View>
          ))
        ) : (
          <AppText muted>No new PRs this session. The completed sets still update exercise history.</AppText>
        )}
      </Card>

      <Button
        label="Log post-workout meal"
        icon={Utensils}
        onPress={() => navigation.navigate('FoodSearch', { mealSlot: 'snacks', localDate: toLocalDateKey() })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  exerciseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
});
