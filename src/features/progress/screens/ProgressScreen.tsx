import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { AddStatBottomSheet } from '@/components/progress/AddStatBottomSheet';
import { EditOverviewBottomSheet } from '@/components/progress/EditOverviewBottomSheet';
import { ProgressChartCard } from '@/components/progress/ProgressChartCard';
import { Screen } from '@/components/Screen';
import { deleteProgressWidget, replaceProgressOverviewModules } from '@/data/repositories/progressWidgetsRepository';
import { TIME_RANGE_OPTIONS, TIME_RANGE_LABELS } from '@/features/progress/widgets/catalog';
import { ProgressOverviewMetric, ProgressOverviewStats, ProgressWidgetCategory, ProgressWidgetConfig, ProgressWidgetTimeRange } from '@/features/progress/widgets/types';
import { useProgressOverview, useProgressOverviewModules, useProgressWidgetSeries, useProgressWidgets } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatNumber(value: number, suffix = ''): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value > 0 ? '+' : ''}${rounded}${suffix}`;
}

function getOverviewCardContent(metric: ProgressOverviewMetric, data: ProgressOverviewStats, range: ProgressWidgetTimeRange) {
  switch (metric) {
    case 'weight_change':
      return {
        title: 'Weight change',
        value: data.weightChangeKg == null ? '--' : formatNumber(data.weightChangeKg, ' kg'),
        subtitle: `vs. ${TIME_RANGE_LABELS[range].toLowerCase()}`,
        highlight: true,
      };
    case 'workouts_completed':
      return {
        title: 'Workouts',
        value: String(data.workoutsCompleted),
        subtitle: `target ${data.workoutsTarget}`,
        highlight: false,
      };
    case 'workouts_target':
      return {
        title: 'Workout target',
        value: String(data.workoutsTarget),
        subtitle: 'planned sessions / week',
        highlight: false,
      };
    case 'workout_completion': {
      const completion = data.workoutsTarget > 0 ? Math.round((data.workoutsCompleted / data.workoutsTarget) * 100) : null;
      return {
        title: 'Workout completion',
        value: completion == null ? '--' : `${completion}%`,
        subtitle: data.workoutsTarget > 0 ? `${data.workoutsCompleted}/${data.workoutsTarget} sessions` : 'set a weekly target',
        highlight: true,
      };
    }
    case 'protein_average':
      return {
        title: 'Protein avg',
        value: `${data.proteinAverageG} g`,
        subtitle: `goal ${data.proteinGoalG} g`,
        highlight: true,
      };
    case 'protein_goal':
      return {
        title: 'Protein goal',
        value: `${data.proteinGoalG} g`,
        subtitle: 'daily target',
        highlight: false,
      };
    case 'calorie_adherence':
      return {
        title: 'Calorie adherence',
        value: `${data.calorieAdherencePct}%`,
        subtitle: `${data.adherenceDays} logged days`,
        highlight: true,
      };
    case 'logged_days':
      return {
        title: 'Logged days',
        value: String(data.adherenceDays),
        subtitle: `in ${TIME_RANGE_LABELS[range].toLowerCase()}`,
        highlight: false,
      };
    default:
      return { title: 'Statistic', value: '--', subtitle: '' };
  }
}

export function ProgressScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<ProgressWidgetTimeRange>('30D');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOverviewOpen, setEditOverviewOpen] = useState(false);

  const overview = useProgressOverview(range);
  const overviewModules = useProgressOverviewModules();
  const widgets = useProgressWidgets();

  const removeWidget = useMutation({
    mutationFn: (widgetId: string) => deleteProgressWidget(widgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.progressWidgets });
    },
  });

  const saveOverviewModules = useMutation({
    mutationFn: (metrics: ProgressOverviewMetric[]) => replaceProgressOverviewModules(metrics),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.progressOverviewModules });
    },
    onError: (error) => {
      Alert.alert('Overview', error instanceof Error ? error.message : 'Unable to update overview modules.');
    },
  });

  if (overview.isLoading || overviewModules.isLoading || widgets.isLoading || !overview.data || !overviewModules.data || !widgets.data) {
    return <LoadingState label="Loading progress" />;
  }

  const data = overview.data;

  return (
    <>
      <Screen resetScrollOnBlur>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <AppText variant="title">Progress</AppText>
            <AppText muted>Training and nutrition trends in one view.</AppText>
          </View>
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
            ]}
          >
            <Plus size={20} color={theme.colors.primary} />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {TIME_RANGE_OPTIONS.map((item) => {
            const active = item === range;
            return (
              <Pressable
                key={item}
                onPress={() => setRange(item)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                  {item}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <AppText variant="section">Overview</AppText>
          <Pressable
            onPress={() => setEditOverviewOpen(true)}
            style={({ pressed }) => [styles.sectionAction, { borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 }]}
          >
            <AppText weight="700" style={{ color: theme.colors.primary }}>
              Edit
            </AppText>
          </Pressable>
        </View>

        <View style={styles.overviewGrid}>
          {overviewModules.data.map((module) => {
            const content = getOverviewCardContent(module.metric, data, range);
            return (
              <Card key={module.id} style={styles.overviewCard}>
                <AppText muted variant="small">
                  {content.title}
                </AppText>
                <AppText style={content.highlight ? { color: theme.colors.primary } : undefined} weight="800">
                  {content.value}
                </AppText>
                <AppText muted variant="small">
                  {content.subtitle}
                </AppText>
              </Card>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <AppText variant="section">Custom stats</AppText>
        </View>

        {widgets.data.length ? (
          widgets.data.map((widget) => (
            <ProgressWidgetCardContainer
              key={widget.id}
              widget={widget}
              onEdit={() => navigation.navigate('ProgressStatConfig', { metricId: widget.metric, widgetId: widget.id })}
              onDelete={() =>
                Alert.alert('Delete statistic?', 'This widget will be removed from your dashboard.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => removeWidget.mutate(widget.id) },
                ])
              }
            />
          ))
        ) : (
          <Card>
            <AppText muted>No custom statistics yet.</AppText>
          </Card>
        )}
      </Screen>

      <AddStatBottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={(category: ProgressWidgetCategory) => {
          setSheetOpen(false);
          navigation.navigate('ProgressStatSelection', { category });
        }}
      />

      <EditOverviewBottomSheet
        visible={editOverviewOpen}
        selectedMetrics={overviewModules.data.map((item) => item.metric)}
        onClose={() => setEditOverviewOpen(false)}
        onSave={(metrics) => {
          setEditOverviewOpen(false);
          saveOverviewModules.mutate(metrics);
        }}
      />
    </>
  );
}

function ProgressWidgetCardContainer({
  widget,
  onEdit,
  onDelete,
}: {
  widget: ProgressWidgetConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const series = useProgressWidgetSeries(widget.id, widget.updatedAt, {
    metric: widget.metric,
    timeRange: widget.timeRange,
    grouping: widget.grouping,
    exerciseId: widget.exerciseId,
  });

  if (series.isLoading || !series.data) {
    return <LoadingState label="Loading statistic" />;
  }

  return <ProgressChartCard widget={widget} series={series.data} onEdit={onEdit} onDelete={onDelete} />;
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionAction: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  overviewCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 94,
  },
});
