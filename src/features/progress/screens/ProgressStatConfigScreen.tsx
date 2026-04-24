import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChartRenderer } from '@/components/progress/ChartRenderer';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { createProgressWidget, getProgressWidget, getProgressWidgetSeries, updateProgressWidget } from '@/data/repositories/progressWidgetsRepository';
import {
  CHART_TYPE_LABELS,
  GROUPING_LABELS,
  TIME_RANGE_LABELS,
  getMetricDefinition,
} from '@/features/progress/widgets/catalog';
import { ProgressWidgetChartType, ProgressWidgetGrouping, ProgressWidgetTimeRange } from '@/features/progress/widgets/types';
import { useExercises } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ProgressStatConfig'>;

export function ProgressStatConfigScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const exercises = useExercises();

  const definition = getMetricDefinition(route.params.metricId);
  const existingWidget = useQuery({
    queryKey: ['progressWidget', route.params.widgetId],
    queryFn: () => getProgressWidget(route.params.widgetId!),
    enabled: Boolean(route.params.widgetId),
  });

  const [chartType, setChartType] = useState<ProgressWidgetChartType>(definition.defaultChartType);
  const [timeRange, setTimeRange] = useState<ProgressWidgetTimeRange>(definition.defaultTimeRange);
  const [grouping, setGrouping] = useState<ProgressWidgetGrouping>(definition.defaultGrouping);
  const [unit, setUnit] = useState(definition.defaultUnit);
  const [exerciseId, setExerciseId] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (!route.params.widgetId) {
      setHydrated(true);
      return;
    }
    if (existingWidget.isLoading) return;
    const widget = existingWidget.data;
    if (widget) {
      setChartType(widget.chartType);
      setTimeRange(widget.timeRange);
      setGrouping(widget.grouping ?? definition.defaultGrouping);
      setUnit(widget.unit ?? definition.defaultUnit);
      setExerciseId(widget.exerciseId);
    }
    setHydrated(true);
  }, [definition.defaultGrouping, definition.defaultUnit, existingWidget.data, existingWidget.isLoading, hydrated, route.params.widgetId]);

  const effectiveExerciseId = useMemo(() => {
    if (!definition.requiresExercise) return undefined;
    if (exerciseId) return exerciseId;
    return exercises.data?.[0]?.id;
  }, [definition.requiresExercise, exerciseId, exercises.data]);

  const preview = useQuery({
    queryKey: ['progressWidgetPreview', definition.metric, chartType, timeRange, grouping, unit, effectiveExerciseId ?? ''],
    queryFn: () =>
      getProgressWidgetSeries({
        metric: definition.metric,
        timeRange,
        grouping,
        exerciseId: effectiveExerciseId,
      }),
    enabled: hydrated && (!definition.requiresExercise || Boolean(effectiveExerciseId)),
  });

  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        type: definition.category,
        metric: definition.metric,
        chartType,
        timeRange,
        unit,
        grouping,
        exerciseId: definition.requiresExercise ? effectiveExerciseId : undefined,
      };
      if (route.params.widgetId) {
        await updateProgressWidget(route.params.widgetId, {
          chartType: draft.chartType,
          timeRange: draft.timeRange,
          unit: draft.unit,
          grouping: draft.grouping,
          exerciseId: draft.exerciseId,
        });
        return;
      }
      await createProgressWidget(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.progressWidgets });
      if (route.params.widgetId) {
        navigation.goBack();
        return;
      }
      navigation.pop(2);
    },
    onError: (error) => {
      Alert.alert('Statistic', error instanceof Error ? error.message : 'Unable to save statistic.');
    },
  });

  if (!hydrated || existingWidget.isLoading || exercises.isLoading) {
    return <LoadingState label="Loading configuration" />;
  }

  return (
    <Screen>
      <Card style={styles.previewCard}>
        <AppText variant="section">{definition.title}</AppText>
        <AppText muted>{definition.description}</AppText>
        {preview.data?.points.length ? (
          <ChartRenderer points={preview.data.points} chartType={chartType} />
        ) : (
          <View style={[styles.emptyPreview, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <AppText muted>{preview.data?.emptyMessage ?? 'Log more data to see this chart'}</AppText>
          </View>
        )}
      </Card>

      <Card>
        <FieldLabel label="Statistic" value={definition.title} />
        {definition.requiresExercise ? (
          <View style={styles.block}>
            <AppText muted variant="small">
              Exercise
            </AppText>
            <View style={styles.chips}>
              {(exercises.data ?? []).slice(0, 10).map((exercise) => {
                const active = (exerciseId ?? effectiveExerciseId) === exercise.id;
                return (
                  <Pressable
                    key={exercise.id}
                    onPress={() => setExerciseId(exercise.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                        opacity: pressed ? 0.84 : 1,
                      },
                    ]}
                  >
                    <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                      {exercise.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <SelectableRow
          label="Chart type"
          options={definition.supportedChartTypes.map((item) => ({ key: item, label: CHART_TYPE_LABELS[item] }))}
          selected={chartType}
          onSelect={(value) => setChartType(value as ProgressWidgetChartType)}
        />

        <SelectableRow
          label="Time range"
          options={(['7D', '30D', '90D', '1Y', 'All'] as ProgressWidgetTimeRange[]).map((item) => ({
            key: item,
            label: TIME_RANGE_LABELS[item],
          }))}
          selected={timeRange}
          onSelect={(value) => setTimeRange(value as ProgressWidgetTimeRange)}
        />

        <SelectableRow
          label="Unit"
          options={definition.unitOptions.map((item) => ({ key: item, label: item }))}
          selected={unit}
          onSelect={(value) => setUnit(value)}
        />

        <SelectableRow
          label="Grouping"
          options={definition.supportedGroupings.map((item) => ({ key: item, label: GROUPING_LABELS[item] }))}
          selected={grouping}
          onSelect={(value) => setGrouping(value as ProgressWidgetGrouping)}
        />
      </Card>

      <Button label="Save" onPress={() => save.mutate()} />
    </Screen>
  );
}

function FieldLabel({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldLabel}>
      <AppText muted variant="small">
        {label}
      </AppText>
      <AppText weight="800">{value}</AppText>
    </View>
  );
}

function SelectableRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.block}>
      <AppText muted variant="small">
        {label}
      </AppText>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => onSelect(option.key)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    gap: 8,
  },
  emptyPreview: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 140,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fieldLabel: {
    gap: 2,
  },
  block: {
    gap: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
