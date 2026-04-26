import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Barcode,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Droplets,
  Flame,
  LucideProps,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Soup,
  Star,
  Target,
  Trash2,
  Utensils,
  Wheat,
} from 'lucide-react-native';
import { ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import {
  addWater,
  addDiaryEntry,
  deleteSavedMeal,
  duplicateSavedMeal,
  logSavedMeal,
  renameSavedMeal,
} from '@/data/repositories/nutritionRepository';
import { updateGoals, updateMealsPerDayTarget } from '@/data/repositories/settingsRepository';
import { shiftLocalDate, toLocalDateKey } from '@/domain/calculations/dates';
import { DiaryEntry, FoodItem, GoalSettings, GoalType, MealSlot, SavedMeal } from '@/domain/models';
import {
  useDiary,
  useCalorieStreak,
  useFoodSearch,
  useFrequentlyLoggedFoods,
  useMealsPerDayTarget,
  useNutritionLibrary,
  useProfileBundle,
  useRecentFoods,
  useWeeklyCalories,
} from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { FoodSuggestionStrip } from '@/features/nutrition/components/FoodSuggestionStrip';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { resolveLastUsedMealSlot } from '@/features/nutrition/utils/foodLogInteractions';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NutritionTab = 'diary' | 'search' | 'meals' | 'goals';
type SearchFilter = 'All' | 'Recent' | 'Favorites' | 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
type CalorieFeedback = { id: number; label: string };
type NutritionLibraryData = { savedMeals: SavedMeal[]; recipes: unknown[] };
type GoalEditorType = Extract<GoalType, 'lose' | 'gain' | 'maintain'>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const NUTRITION_TABS: Array<{ key: NutritionTab; label: string }> = [
  { key: 'diary', label: 'Diary' },
  { key: 'search', label: 'Search' },
  { key: 'meals', label: 'Meals' },
  { key: 'goals', label: 'Goals' },
];

const SEARCH_FILTERS: SearchFilter[] = ['All', 'Recent', 'Favorites', 'Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const MEAL_SECTIONS: Array<{
  slot: MealSlot;
  label: string;
  icon: ComponentType<LucideProps>;
  color: string;
  tint: string;
}> = [
  { slot: 'breakfast', label: 'Breakfast', icon: Wheat, color: '#F4B740', tint: '#2A2414' },
  { slot: 'lunch', label: 'Lunch', icon: Soup, color: '#F29A42', tint: '#2A2117' },
  { slot: 'dinner', label: 'Dinner', icon: Clock, color: '#9B8CFF', tint: '#201F34' },
  { slot: 'snacks', label: 'Snacks', icon: Star, color: '#35C77A', tint: '#14271D' },
];

const THUMBNAIL_ICONS: ComponentType<LucideProps>[] = [Soup, Utensils, Wheat, Star];

const FILTER_TO_SLOT: Partial<Record<SearchFilter, MealSlot>> = {
  Breakfast: 'breakfast',
  Lunch: 'lunch',
  Dinner: 'dinner',
  Snacks: 'snacks',
};

const GOAL_TYPE_OPTIONS: Array<{ key: GoalEditorType; label: string }> = [
  { key: 'lose', label: 'Cut' },
  { key: 'gain', label: 'Bulk' },
  { key: 'maintain', label: 'Maintain' },
];

function roundMetric(value: number): number {
  return Math.round(value);
}

function entryCalories(entry: DiaryEntry): number {
  return entry.caloriesSnapshot * entry.servings;
}

function mealTotals(savedMeal: SavedMeal, foodsById: Map<string, FoodItem>) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of savedMeal.items) {
    const food = foodsById.get(item.foodItemId);
    if (food) {
      totals.calories += food.calories * item.servings;
      totals.protein += food.proteinG * item.servings;
      totals.carbs += food.carbsG * item.servings;
      totals.fat += food.fatG * item.servings;
      continue;
    }
    // Fallback estimates when food snapshots are not available in cache.
    totals.calories += 120 * item.servings;
    totals.protein += 8 * item.servings;
    totals.carbs += 10 * item.servings;
    totals.fat += 4 * item.servings;
  }
  return {
    calories: roundMetric(totals.calories),
    protein: roundMetric(totals.protein),
    carbs: roundMetric(totals.carbs),
    fat: roundMetric(totals.fat),
  };
}

function mealIngredientPreview(savedMeal: SavedMeal, foodsById: Map<string, FoodItem>): string {
  const names = savedMeal.items.map((item) => foodsById.get(item.foodItemId)?.name).filter((name): name is string => Boolean(name));
  if (!names.length) return savedMeal.items.length ? `${savedMeal.items.length} ingredients` : 'No ingredients yet';
  const visible = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${visible} +${names.length - 3}` : visible;
}

function resolveSavedMealSlot(savedMeal: SavedMeal, fallback: MealSlot): MealSlot {
  const counts: Record<MealSlot, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snacks: 0,
  };

  for (const item of savedMeal.items) {
    if (item.mealSlot) {
      counts[item.mealSlot] += 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0) {
    return sorted[0][0] as MealSlot;
  }

  return fallback;
}

function duplicateMealName(sourceName: string, existingMeals: SavedMeal[]): string {
  const baseName = `${sourceName.trim() || 'Meal'} Copy`;
  const existing = new Set(existingMeals.map((meal) => meal.name.trim().toLowerCase()));
  let candidate = baseName;
  let suffix = 2;

  while (existing.has(candidate.toLowerCase())) {
    candidate = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function foodIngredientPreview(food: FoodItem): string {
  if (food.brandName) return food.brandName;
  return `${food.servingSize} ${food.servingUnit}`;
}

function MealMacroVisual({ protein, carbs, fat, compact }: { protein: number; carbs: number; fat: number; compact?: boolean }) {
  const theme = useAppTheme();
  const macros = [
    { label: 'Protein', short: 'P', value: protein, color: theme.colors.primary },
    { label: 'Carbs', short: 'C', value: carbs, color: theme.colors.info },
    { label: 'Fat', short: 'F', value: fat, color: theme.colors.warning },
  ];
  const total = Math.max(1, protein + carbs + fat);

  return (
    <View style={styles.mealsMacroWrap}>
      <View style={[styles.mealsMacroTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        {macros.map((macro) => (
          <View key={macro.short} style={[styles.mealsMacroFill, { backgroundColor: macro.color, flex: Math.max(0.08, macro.value / total) }]} />
        ))}
      </View>
      <View style={styles.mealsMacroLegend}>
        {macros.map((macro) => (
          <View key={macro.short} style={styles.mealsMacroLegendItem}>
            <View style={[styles.mealsMacroDot, { backgroundColor: macro.color }]} />
            <AppText muted variant="small">
              {compact ? macro.short : macro.label} {roundMetric(macro.value)}g
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function strategyCopy(goal: GoalSettings['goal']): string {
  if (goal === 'lose') return 'Calorie deficit with high protein to preserve lean mass.';
  if (goal === 'gain') return 'Lean-bulk setup focused on performance and recovery.';
  if (goal === 'maintain') return 'Balanced maintenance with steady energy and macro intake.';
  return 'Custom nutrition strategy adapted to your daily targets.';
}

function normalizeGoalForEditor(goal: GoalSettings['goal']): GoalEditorType {
  if (goal === 'lose' || goal === 'gain' || goal === 'maintain') return goal;
  return 'maintain';
}

function parseGoalInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function clampedProgress(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function progressPercent(progress: number): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

function remainingCalorieLabel(value: number): string {
  if (value >= 0) return `${value} kcal left`;
  return `${Math.abs(value)} kcal over`;
}

function mealItemLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function weekdayAbbrev(localDate: string): string {
  const label = new Date(`${localDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  return label.slice(0, 1);
}

function lastMealFoodLabel(entries: DiaryEntry[]): string {
  if (!entries.length) return 'No food logged yet';
  return entries[entries.length - 1].foodNameSnapshot;
}

function CalorieHeroRing({ progress }: { progress: number }) {
  const theme = useAppTheme();
  const size = 264;
  const strokeWidth = 20;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(1, progress));
  const animatedProgress = useSharedValue(0);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  useEffect(() => {
    animatedProgress.value = withTiming(normalized, { duration: 850 });
  }, [animatedProgress, normalized]);

  return (
    <View style={styles.calorieHeroRing}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center},${center}`}>
          <Circle cx={center} cy={center} fill="none" r={radius} stroke="rgba(255,255,255,0.055)" strokeWidth={strokeWidth} />
          <AnimatedCircle
            animatedProps={animatedProps}
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={theme.colors.primary}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="round"
            strokeOpacity={0.18}
            strokeWidth={strokeWidth + 8}
          />
          <AnimatedCircle
            animatedProps={animatedProps}
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={theme.colors.primary}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="round"
            strokeOpacity={0.76}
            strokeWidth={strokeWidth}
          />
        </G>
      </Svg>
    </View>
  );
}

function CalorieFeedbackBadge({ feedback }: { feedback?: CalorieFeedback | null }) {
  const theme = useAppTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const scale = useSharedValue(0.96);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  useEffect(() => {
    if (!feedback) return;
    opacity.value = withSequence(withTiming(1, { duration: 160 }), withDelay(720, withTiming(0, { duration: 320 })));
    translateY.value = withSequence(withTiming(0, { duration: 180 }), withDelay(720, withTiming(-8, { duration: 320 })));
    scale.value = withSequence(withTiming(1, { duration: 180 }), withDelay(720, withTiming(0.98, { duration: 320 })));
  }, [feedback, opacity, scale, translateY]);

  if (!feedback) return null;

  return (
    <Animated.View style={[styles.calorieFeedbackBadge, { backgroundColor: 'rgba(53,199,122,0.18)' }, animatedStyle]}>
      <AppText weight="800" style={{ color: theme.colors.primary }}>
        {feedback.label}
      </AppText>
    </Animated.View>
  );
}

function MacroProgressItem({
  label,
  value,
  goal,
  color,
  tint,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
  tint: string;
}) {
  const theme = useAppTheme();
  const progress = clampedProgress(value, goal);
  const percent = progressPercent(progress);

  return (
    <View style={[styles.macroDashboardItem, { backgroundColor: tint }]}>
      <View pointerEvents="none" style={[styles.macroDashboardGlow, { backgroundColor: color }]} />
      <View style={[styles.macroDashboardAccent, { backgroundColor: color }]} />
      <View style={styles.macroDashboardTop}>
        <View style={styles.macroDashboardLabelRow}>
          <View style={[styles.macroDashboardDot, { backgroundColor: color }]} />
          <AppText weight="800" variant="small">
            {label}
          </AppText>
        </View>
        <View style={[styles.macroPercentPill, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText weight="800" variant="small" style={{ color }}>
            {percent}%
          </AppText>
        </View>
      </View>
      <View>
        <AppText style={styles.macroDashboardValue}>
          {value}g
        </AppText>
        <AppText muted variant="small">
          target {goal}g
        </AppText>
      </View>
      <View style={[styles.thinProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.thinProgressFill, { backgroundColor: color, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function CaloriesDashboardCard({
  calories,
  target,
  remaining,
  progress,
  protein,
  carbs,
  fat,
  goals,
  feedback,
}: {
  calories: number;
  target: number;
  remaining: number;
  progress: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: GoalSettings;
  feedback?: CalorieFeedback | null;
}) {
  const theme = useAppTheme();

  return (
    <NutritionCard style={styles.caloriesDashboardCard}>
      <View style={styles.calorieHero}>
        <CalorieHeroRing progress={progress} />
        <View style={styles.calorieHeroCenter}>
          <CalorieFeedbackBadge feedback={feedback} />
          <AppText muted weight="800" style={styles.calorieHeroLabel}>
            Calories
          </AppText>
          <View style={styles.calorieHeroValueRow}>
            <AppText style={[styles.calorieHeroValue, { color: theme.colors.text }]}>{calories}</AppText>
            <AppText style={[styles.calorieHeroUnit, { color: theme.colors.text }]}>kcal</AppText>
          </View>
          <AppText weight="800" style={[styles.calorieHeroLeft, { color: remaining >= 0 ? theme.colors.primary : theme.colors.warning }]}>
            {remainingCalorieLabel(remaining)}
          </AppText>
          <AppText muted style={styles.calorieHeroTarget}>
            {progressPercent(progress)}% of {target} kcal
          </AppText>
        </View>
      </View>

      <View style={styles.macroDashboardRow}>
        <MacroProgressItem label="Protein" value={protein} goal={goals.proteinTargetG} color={theme.colors.primary} tint="rgba(53,199,122,0.09)" />
        <MacroProgressItem label="Carbs" value={carbs} goal={goals.carbTargetG} color={theme.colors.info} tint="rgba(55,156,255,0.09)" />
        <MacroProgressItem label="Fat" value={fat} goal={goals.fatTargetG} color={theme.colors.warning} tint="rgba(244,183,64,0.1)" />
      </View>
    </NutritionCard>
  );
}

function CalorieStreakBadge({ streak, isLoading }: { streak: number; isLoading: boolean }) {
  const theme = useAppTheme();
  const active = streak > 0;

  return (
    <View
      style={[
        styles.calorieStreakBadge,
        {
          backgroundColor: active ? 'rgba(244,183,64,0.14)' : 'rgba(31,39,48,0.45)',
          borderColor: active ? 'rgba(244,183,64,0.42)' : 'rgba(90,102,116,0.35)',
        },
      ]}
    >
      <Flame size={14} color={active ? theme.colors.warning : theme.colors.muted} />
      <AppText muted variant="small" weight="700" style={styles.calorieStreakLabel}>
        {isLoading ? 'Streak…' : `${streak} day streak`}
      </AppText>
    </View>
  );
}

function WeeklyCaloriesCard({
  points,
  isLoading,
}: {
  points: Array<{ localDate: string; calories: number; label: string }>;
  isLoading: boolean;
}) {
  const theme = useAppTheme();
  const maxCalories = Math.max(1, ...points.map((point) => point.calories));
  const avgCalories = points.length ? roundMetric(points.reduce((sum, point) => sum + point.calories, 0) / points.length) : 0;
  const today = points[points.length - 1];

  return (
    <NutritionCard style={styles.weeklyCaloriesCard}>
      <View style={styles.weeklyCaloriesHeader}>
        <AppText variant="section">Last 7 days</AppText>
        <AppText muted>{avgCalories} avg kcal</AppText>
      </View>

      <View style={styles.weeklyCaloriesChart}>
        {points.map((point, index) => {
          const heightPct = isLoading ? 0.24 + (index % 4) * 0.14 : Math.max(0.12, point.calories / maxCalories);
          const isToday = index === points.length - 1;
          return (
            <View key={point.localDate} style={styles.weeklyCaloriesBarItem}>
              <View style={[styles.weeklyCaloriesBarTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                <View
                  style={[
                    styles.weeklyCaloriesBarFill,
                    {
                      backgroundColor: isToday ? theme.colors.primary : 'rgba(162,170,182,0.52)',
                      height: `${Math.round(heightPct * 100)}%`,
                    },
                  ]}
                />
              </View>
              <AppText muted variant="small" style={styles.weeklyCaloriesLabel}>
                {point.label}
              </AppText>
            </View>
          );
        })}
      </View>

      <AppText muted variant="small">
        {isLoading ? 'Loading weekly calories…' : `${today?.calories ?? 0} kcal today`}
      </AppText>
    </NutritionCard>
  );
}

function MealSummaryCard({
  label,
  calories,
  count,
  calorieTarget,
  entries,
  previousEntries,
  expanded,
  icon: Icon,
  color,
  tint,
  onToggle,
  onAddFood,
  onQuickAddLastFood,
  onRepeatPreviousMeal,
}: {
  label: string;
  calories: number;
  count: number;
  calorieTarget: number;
  entries: DiaryEntry[];
  previousEntries: DiaryEntry[];
  expanded: boolean;
  icon: ComponentType<LucideProps>;
  color: string;
  tint: string;
  onToggle: () => void;
  onAddFood: () => void;
  onQuickAddLastFood: () => void;
  onRepeatPreviousMeal: () => void;
}) {
  const theme = useAppTheme();
  const progress = clampedProgress(calories, calorieTarget);
  const ProgressChevron = expanded ? ChevronUp : ChevronDown;
  const repeatDisabled = !previousEntries.length;
  const swipeActionBase = { backgroundColor: theme.colors.surfaceAlt };

  const renderLeftActions = () => (
    <View style={[styles.mealSwipeAction, styles.mealSwipeLeft, { backgroundColor: color }]}>
      <Plus size={18} color="#06100B" strokeWidth={2.8} />
      <AppText weight="800" style={styles.mealSwipePrimaryText}>
        Quick add
      </AppText>
    </View>
  );

  const renderRightActions = () => (
    <View style={[styles.mealSwipeAction, styles.mealSwipeRight, swipeActionBase]}>
      <Search size={18} color={theme.colors.text} strokeWidth={2.6} />
      <AppText weight="800">Add food</AppText>
    </View>
  );

  return (
    <Swipeable
      friction={1.15}
      leftThreshold={64}
      rightThreshold={64}
      overshootFriction={9}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction, swipeable) => {
        swipeable.close();
        if (direction === 'left') {
          onQuickAddLastFood();
        } else {
          onAddFood();
        }
      }}
    >
      <NutritionCard style={styles.mealSummaryCard}>
        <View pointerEvents="none" style={[styles.mealCardGlow, { backgroundColor: color }]} />
        <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.mealSummaryMain, { opacity: pressed ? 0.86 : 1 }]}>
          <View style={[styles.mealSummaryIcon, { backgroundColor: tint }]}>
            <Icon size={22} color={color} strokeWidth={2.4} />
          </View>
          <View style={styles.mealSummaryCopy}>
            <View style={styles.mealSummaryTitleRow}>
              <AppText weight="800" numberOfLines={1} style={styles.mealSummaryTitle}>
                {label}
              </AppText>
              <AppText weight="800" style={{ color }}>
                {progressPercent(progress)}%
              </AppText>
            </View>
            <AppText muted>
              {calories} kcal • {mealItemLabel(count)}
            </AppText>
            <AppText muted numberOfLines={1} style={styles.mealLastFood}>
              {lastMealFoodLabel(entries)}
            </AppText>
          </View>
          <ProgressChevron size={20} color={theme.colors.muted} />
        </Pressable>

        <View style={[styles.mealProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
          <View style={[styles.mealProgressFill, { backgroundColor: color, width: `${progress * 100}%` }]} />
        </View>

        {expanded ? (
          <View style={styles.mealExpandedContent}>
            {entries.length ? (
              entries.map((entry) => (
                <View key={entry.id} style={styles.mealFoodRow}>
                  <View style={[styles.mealFoodDot, { backgroundColor: color }]} />
                  <View style={styles.mealFoodCopy}>
                    <AppText weight="700" numberOfLines={1}>
                      {entry.foodNameSnapshot}
                    </AppText>
                    <AppText muted variant="small">
                      {entry.servings} serving{entry.servings === 1 ? '' : 's'}
                    </AppText>
                  </View>
                  <AppText weight="800" style={{ color }}>
                    {roundMetric(entryCalories(entry))} kcal
                  </AppText>
                </View>
              ))
            ) : (
              <View style={styles.mealEmptyRow}>
                <AppText muted>No foods logged.</AppText>
              </View>
            )}

            <View style={styles.mealInlineActions}>
              <Pressable
                accessibilityRole="button"
                disabled={repeatDisabled}
                onPress={onRepeatPreviousMeal}
                style={({ pressed }) => [styles.mealActionPill, { opacity: repeatDisabled ? 0.45 : pressed ? 0.78 : 1 }]}
              >
                <RotateCcw size={16} color={repeatDisabled ? theme.colors.muted : color} strokeWidth={2.4} />
                <AppText weight="800" style={{ color: repeatDisabled ? theme.colors.muted : color }}>
                  Repeat previous meal
                </AppText>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={onAddFood} style={({ pressed }) => [styles.mealActionPill, { opacity: pressed ? 0.82 : 1 }]}>
                <Plus size={16} color={color} strokeWidth={2.4} />
                <AppText weight="800" style={{ color }}>
                  Add food
                </AppText>
                <ChevronRight size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </NutritionCard>
    </Swipeable>
  );
}

function SavedMealCard({
  meal,
  icon: Icon,
  totals,
  ingredients,
  recentlyAdded,
  quickAddPending,
  editPending,
  duplicatePending,
  deletePending,
  onQuickAdd,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  meal: SavedMeal;
  icon: ComponentType<LucideProps>;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  ingredients: string;
  recentlyAdded: boolean;
  quickAddPending: boolean;
  editPending: boolean;
  duplicatePending: boolean;
  deletePending: boolean;
  onQuickAdd: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const swipeableRef = useRef<Swipeable | null>(null);
  const actionPending = editPending || duplicatePending || deletePending;
  const tapDisabled = actionPending || quickAddPending;

  const runAction = (action: () => void) => {
    swipeableRef.current?.close();
    action();
  };

  const renderLeftActions = () => (
    <View style={styles.savedMealSwipeActionsLeft}>
      <Pressable
        accessibilityRole="button"
        disabled={actionPending}
        onPress={() => runAction(onDuplicate)}
        style={({ pressed }) => [
          styles.savedMealSwipeAction,
          styles.savedMealSwipeLeftAction,
          {
            backgroundColor: theme.colors.info,
            opacity: actionPending ? 0.45 : pressed ? 0.78 : 1,
          },
        ]}
      >
        <Copy size={16} color="#041016" strokeWidth={2.6} />
        <AppText weight="800" style={styles.savedMealSwipeLabelPrimary}>
          Duplicate
        </AppText>
      </Pressable>
    </View>
  );

  const renderRightActions = () => (
    <View style={styles.savedMealSwipeActionsRight}>
      <Pressable
        accessibilityRole="button"
        disabled={actionPending}
        onPress={() => runAction(onEdit)}
        style={({ pressed }) => [
          styles.savedMealSwipeAction,
          styles.savedMealSwipeMiddleAction,
          {
            backgroundColor: theme.colors.surfaceAlt,
            opacity: actionPending ? 0.45 : pressed ? 0.82 : 1,
          },
        ]}
      >
        <Pencil size={16} color={theme.colors.text} strokeWidth={2.5} />
        <AppText weight="800">Edit</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={actionPending}
        onPress={() => runAction(onDelete)}
        style={({ pressed }) => [
          styles.savedMealSwipeAction,
          styles.savedMealSwipeRightAction,
          {
            backgroundColor: 'rgba(242,95,92,0.2)',
            opacity: actionPending ? 0.45 : pressed ? 0.82 : 1,
          },
        ]}
      >
        <Trash2 size={16} color={theme.colors.danger} strokeWidth={2.6} />
        <AppText weight="800" style={{ color: theme.colors.danger }}>
          Delete
        </AppText>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      friction={1.08}
      leftThreshold={56}
      rightThreshold={56}
      overshootFriction={9}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
    >
      <NutritionCard style={[styles.savedMealCard, recentlyAdded && styles.savedMealCardAdded]}>
        <Pressable
          accessibilityRole="button"
          disabled={tapDisabled}
          onPress={onQuickAdd}
          style={({ pressed }) => [styles.savedMealRow, { opacity: tapDisabled ? 0.62 : pressed ? 0.84 : 1 }]}
        >
          <View style={[styles.savedMealThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Icon size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.savedMealCopy}>
            <AppText weight="800" numberOfLines={1} style={styles.savedMealTitle}>
              {meal.name}
            </AppText>
            <AppText muted numberOfLines={1} style={styles.savedMealPreview}>
              {ingredients}
            </AppText>
            <AppText weight="800" style={styles.savedMealCalories}>
              {totals.calories} kcal
            </AppText>
            <MealMacroVisual protein={totals.protein} carbs={totals.carbs} fat={totals.fat} />
          </View>
          <View style={styles.savedMealTrail}>
            {quickAddPending ? (
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                Adding...
              </AppText>
            ) : recentlyAdded ? (
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                Added
              </AppText>
            ) : null}
            <ChevronRight size={20} color={theme.colors.muted} />
          </View>
        </Pressable>
      </NutritionCard>
    </Swipeable>
  );
}

export function NutritionDiaryScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const localDate = toLocalDateKey();
  const yesterdayDate = shiftLocalDate(localDate, -1);

  const [tab, setTab] = useState<NutritionTab>('diary');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('All');
  const [manualRecentSearches, setManualRecentSearches] = useState<string[]>([]);
  const previousCaloriesRef = useRef<number | null>(null);
  const feedbackCounterRef = useRef(0);
  const [calorieFeedback, setCalorieFeedback] = useState<CalorieFeedback | null>(null);
  const [expandedMealSlots, setExpandedMealSlots] = useState<Set<MealSlot>>(() => new Set());
  const [recentlyAddedSavedMealId, setRecentlyAddedSavedMealId] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<{
    goal: GoalEditorType;
    calorieTarget: string;
    proteinTargetG: string;
    carbTargetG: string;
    fatTargetG: string;
    waterTargetMl: string;
    mealsPerDayTarget: string;
  }>({
    goal: 'maintain',
    calorieTarget: '',
    proteinTargetG: '',
    carbTargetG: '',
    fatTargetG: '',
    waterTargetMl: '',
    mealsPerDayTarget: '4',
  });

  const diary = useDiary(localDate);
  const yesterdayDiary = useDiary(yesterdayDate);
  const profile = useProfileBundle();
  const mealsPerDayTarget = useMealsPerDayTarget();
  const nutritionLibrary = useNutritionLibrary();
  const recentFoods = useRecentFoods();
  const searchedFoods = useFoodSearch(searchQuery);
  const foodCatalog = useFoodSearch('');
  const frequentlyLoggedFoods = useFrequentlyLoggedFoods();
  const weeklyCalories = useWeeklyCalories(localDate);
  const calorieStreak = useCalorieStreak(localDate);

  const flashSavedMealAdded = (savedMealId: string) => {
    setRecentlyAddedSavedMealId(savedMealId);
    setTimeout(() => {
      setRecentlyAddedSavedMealId((current) => (current === savedMealId ? null : current));
    }, 820);
  };

  const quickAdd = useMutation({
    mutationFn: (input: { foodItemId: string; mealSlot: MealSlot; servings?: number; food?: FoodItem }) =>
      addDiaryEntry({
        localDate,
        mealSlot: input.mealSlot,
        foodItemId: input.foodItemId,
        food: input.food,
        servings: input.servings ?? 1,
      }),
    onSuccess: (_entryId, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      queryClient.invalidateQueries({ queryKey: queryKeys.frequentlyLoggedFoods });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => Alert.alert('Meal quick add', error instanceof Error ? error.message : 'Unable to add food.'),
  });

  const repeatPreviousMeal = useMutation({
    mutationFn: async (input: { mealSlot: MealSlot; entries: DiaryEntry[] }) => {
      if (!input.entries.length) {
        throw new Error('No previous meal found for this slot.');
      }

      for (const entry of input.entries) {
        await addDiaryEntry({
          localDate,
          mealSlot: input.mealSlot,
          foodItemId: entry.foodItemId,
          servings: entry.servings,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      queryClient.invalidateQueries({ queryKey: queryKeys.frequentlyLoggedFoods });
    },
    onError: (error) => Alert.alert('Repeat previous meal', error instanceof Error ? error.message : 'Unable to repeat meal.'),
  });

  const updateSavedMealsCache = (updater: (savedMeals: SavedMeal[]) => SavedMeal[]) => {
    queryClient.setQueryData<NutritionLibraryData | undefined>(queryKeys.nutritionLibrary, (current) => {
      if (!current) return current;
      return {
        ...current,
        savedMeals: updater(current.savedMeals),
      };
    });
  };

  const quickAddSavedMealMutation = useMutation({
    mutationFn: (input: { savedMealId: string; mealSlot: MealSlot }) => logSavedMeal(input.savedMealId, input.mealSlot, localDate),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      queryClient.invalidateQueries({ queryKey: queryKeys.frequentlyLoggedFoods });
      flashSavedMealAdded(input.savedMealId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => Alert.alert('Meal quick add', error instanceof Error ? error.message : 'Unable to quick add meal.'),
  });

  const renameSavedMealMutation = useMutation({
    mutationFn: (input: { savedMealId: string; name: string }) => renameSavedMeal(input.savedMealId, input.name),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.nutritionLibrary });
      const previousData = queryClient.getQueryData<NutritionLibraryData>(queryKeys.nutritionLibrary);
      updateSavedMealsCache((savedMeals) =>
        savedMeals.map((meal) =>
          meal.id === input.savedMealId
            ? {
                ...meal,
                name: input.name,
              }
            : meal,
        ),
      );
      return { previousData };
    },
    onError: (error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.nutritionLibrary, context.previousData);
      }
      Alert.alert('Edit meal', error instanceof Error ? error.message : 'Unable to update meal name.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLibrary });
    },
  });

  const duplicateSavedMealMutation = useMutation({
    mutationFn: (input: { savedMeal: SavedMeal }) => duplicateSavedMeal(input.savedMeal.id),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.nutritionLibrary });
      const previousData = queryClient.getQueryData<NutritionLibraryData>(queryKeys.nutritionLibrary);
      const now = new Date().toISOString();
      const optimisticMealId = `optimistic_savedmeal_${input.savedMeal.id}_${Date.now()}`;

      updateSavedMealsCache((savedMeals) => {
        const optimisticName = duplicateMealName(input.savedMeal.name, savedMeals);
        const optimisticMeal: SavedMeal = {
          ...input.savedMeal,
          id: optimisticMealId,
          name: optimisticName,
          items: input.savedMeal.items.map((item, index) => ({
            ...item,
            id: `optimistic_savedmeal_item_${index}_${Date.now()}`,
            savedMealId: optimisticMealId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            syncStatus: 'pending',
            version: 1,
          })),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'pending',
          version: 1,
        };

        const sourceIndex = savedMeals.findIndex((meal) => meal.id === input.savedMeal.id);
        if (sourceIndex < 0) {
          return [optimisticMeal, ...savedMeals];
        }

        const next = [...savedMeals];
        next.splice(sourceIndex + 1, 0, optimisticMeal);
        return next;
      });
      return { previousData };
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.nutritionLibrary, context.previousData);
      }
      Alert.alert('Duplicate meal', error instanceof Error ? error.message : 'Unable to duplicate meal.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLibrary });
    },
  });

  const deleteSavedMealMutation = useMutation({
    mutationFn: (input: { savedMealId: string }) => deleteSavedMeal(input.savedMealId),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.nutritionLibrary });
      const previousData = queryClient.getQueryData<NutritionLibraryData>(queryKeys.nutritionLibrary);
      updateSavedMealsCache((savedMeals) => savedMeals.filter((meal) => meal.id !== input.savedMealId));
      return { previousData };
    },
    onSuccess: () => {
      void Haptics.selectionAsync();
    },
    onError: (error, _input, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.nutritionLibrary, context.previousData);
      }
      Alert.alert('Delete meal', error instanceof Error ? error.message : 'Unable to delete meal.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLibrary });
    },
  });

  const saveGoalSettingsMutation = useMutation({
    mutationFn: (input: {
      goal: GoalEditorType;
      calorieTarget: number;
      proteinTargetG: number;
      carbTargetG: number;
      fatTargetG: number;
      waterTargetMl: number;
      mealsPerDayTarget: number;
    }) =>
      Promise.all([
        updateGoals({
          goal: input.goal,
          calorieTarget: input.calorieTarget,
          proteinTargetG: input.proteinTargetG,
          carbTargetG: input.carbTargetG,
          fatTargetG: input.fatTargetG,
          waterTargetMl: input.waterTargetMl,
        }),
        updateMealsPerDayTarget(input.mealsPerDayTarget),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.mealsPerDayTarget });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => Alert.alert('Goals', error instanceof Error ? error.message : 'Unable to save goal settings.'),
  });

  const quickLogWaterMutation = useMutation({
    mutationFn: (amountMl: number) => addWater(amountMl, localDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void Haptics.selectionAsync();
    },
    onError: (error) => Alert.alert('Water', error instanceof Error ? error.message : 'Unable to log water.'),
  });

  const diaryData = diary.data;
  const goals = profile.data?.goals;
  const meals = nutritionLibrary.data?.savedMeals ?? [];
  const recentList = recentFoods.data ?? [];
  const searchList = searchedFoods.data ?? [];
  const catalogList = foodCatalog.data ?? [];

  const foodsById = useMemo(() => {
    const index = new Map<string, FoodItem>();
    for (const food of catalogList) index.set(food.id, food);
    for (const food of recentList) index.set(food.id, food);
    for (const food of searchList) index.set(food.id, food);
    return index;
  }, [catalogList, recentList, searchList]);

  const favoriteFoodIds = useMemo(() => {
    const set = new Set<string>();
    for (const meal of meals) {
      if (!meal.isFavorite) continue;
      for (const item of meal.items) {
        set.add(item.foodItemId);
      }
    }
    return set;
  }, [meals]);

  const recentFoodIds = useMemo(() => new Set(recentList.map((food) => food.id)), [recentList]);

  const slotByFoodId = useMemo(() => {
    const counts = new Map<string, Record<MealSlot, number>>();
    for (const entry of diaryData?.day.entries ?? []) {
      const existing = counts.get(entry.foodItemId) ?? { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
      existing[entry.mealSlot] += 1;
      counts.set(entry.foodItemId, existing);
    }
    const resolved = new Map<string, MealSlot>();
    for (const [foodId, stat] of counts) {
      const sorted = Object.entries(stat).sort((a, b) => b[1] - a[1]);
      resolved.set(foodId, sorted[0][0] as MealSlot);
    }
    return resolved;
  }, [diaryData?.day.entries]);

  const mealSections = useMemo(
    () =>
      MEAL_SECTIONS.map((section) => {
        const entries = diaryData?.byMeal[section.slot] ?? [];
        const previousEntries = yesterdayDiary.data?.byMeal[section.slot] ?? [];
        const kcal = entries.reduce((sum, entry) => sum + entryCalories(entry), 0);
        return {
          ...section,
          entries,
          previousEntries,
          calories: roundMetric(kcal),
          count: entries.length,
        };
      }),
    [diaryData?.byMeal, yesterdayDiary.data?.byMeal],
  );

  const weeklyDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftLocalDate(localDate, index - 6)), [localDate]);
  const weeklyCaloriesPoints = useMemo(() => {
    const byDate = new Map((weeklyCalories.data ?? []).map((row) => [row.localDate, roundMetric(row.totals.calories)]));
    return weeklyDates.map((date) => ({
      localDate: date,
      calories: byDate.get(date) ?? 0,
      label: weekdayAbbrev(date),
    }));
  }, [weeklyCalories.data, weeklyDates]);

  const calorieTarget = goals?.calorieTarget ?? 0;
  const calories = roundMetric(diaryData?.totals.calories ?? 0);
  const remainingCalories = roundMetric(calorieTarget - calories);
  const calorieProgress = calorieTarget <= 0 ? 0 : Math.max(0, Math.min(1, calories / calorieTarget));
  const protein = roundMetric(diaryData?.totals.proteinG ?? 0);
  const carbs = roundMetric(diaryData?.totals.carbsG ?? 0);
  const fat = roundMetric(diaryData?.totals.fatG ?? 0);

  useEffect(() => {
    if (!goals) return;
    setGoalDraft((current) => ({
      ...current,
      goal: normalizeGoalForEditor(goals.goal),
      calorieTarget: String(Math.round(goals.calorieTarget)),
      proteinTargetG: String(Math.round(goals.proteinTargetG)),
      carbTargetG: String(Math.round(goals.carbTargetG)),
      fatTargetG: String(Math.round(goals.fatTargetG)),
      waterTargetMl: String(Math.round(goals.waterTargetMl)),
    }));
  }, [goals?.goal, goals?.calorieTarget, goals?.proteinTargetG, goals?.carbTargetG, goals?.fatTargetG, goals?.waterTargetMl]);

  useEffect(() => {
    if (typeof mealsPerDayTarget.data !== 'number') return;
    setGoalDraft((current) => ({ ...current, mealsPerDayTarget: String(mealsPerDayTarget.data) }));
  }, [mealsPerDayTarget.data]);

  useEffect(() => {
    if (!diaryData || !goals) {
      return;
    }

    const previousCalories = previousCaloriesRef.current;
    if (previousCalories !== null && calories > previousCalories) {
      feedbackCounterRef.current += 1;
      setCalorieFeedback({ id: feedbackCounterRef.current, label: `+${calories - previousCalories} kcal` });
    }
    previousCaloriesRef.current = calories;
  }, [calories, diaryData, goals]);

  const searchBase = searchQuery.trim().length ? searchList : recentList;
  const filteredSearchResults = useMemo(() => {
    const slot = FILTER_TO_SLOT[searchFilter];
    return searchBase.filter((food) => {
      if (searchFilter === 'Recent') return recentFoodIds.has(food.id);
      if (searchFilter === 'Favorites') return favoriteFoodIds.has(food.id);
      if (slot) return slotByFoodId.get(food.id) === slot;
      return true;
    });
  }, [searchBase, searchFilter, recentFoodIds, favoriteFoodIds, slotByFoodId]);

  const recentSearches = useMemo(() => {
    const auto = recentList.slice(0, 4).map((item) => item.name);
    return Array.from(new Set([...manualRecentSearches, ...auto])).slice(0, 8);
  }, [manualRecentSearches, recentList]);

  const mealCards = useMemo(
    () =>
      meals.map((meal, index) => ({
        meal,
        icon: THUMBNAIL_ICONS[index % THUMBNAIL_ICONS.length],
        totals: mealTotals(meal, foodsById),
        ingredients: mealIngredientPreview(meal, foodsById),
      })),
    [meals, foodsById],
  );

  const favoriteMeals = mealCards.filter((item) => item.meal.isFavorite);
  const activeSearchMealSlot = FILTER_TO_SLOT[searchFilter] ?? 'lunch';
  const recentMealsPreview = recentList.slice(0, 3);
  const lastUsedSearchMealSlot = useMemo(
    () => resolveLastUsedMealSlot(diaryData?.day.entries ?? [], activeSearchMealSlot),
    [activeSearchMealSlot, diaryData?.day.entries],
  );
  const defaultSavedMealSlot = useMemo(() => resolveLastUsedMealSlot(diaryData?.day.entries ?? [], 'lunch'), [diaryData?.day.entries]);

  const rememberSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.length) return;
    setManualRecentSearches((current) => [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8));
  };

  const toggleMealSlot = (slot: MealSlot) => {
    setExpandedMealSlots((current) => {
      const next = new Set(current);
      if (next.has(slot)) {
        next.delete(slot);
      } else {
        next.add(slot);
      }
      return next;
    });
  };

  const quickAddLastMealFood = (slot: MealSlot, entries: DiaryEntry[], previousEntries: DiaryEntry[]) => {
    const entry = entries[entries.length - 1] ?? previousEntries[previousEntries.length - 1];
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!entry) {
      Alert.alert('Quick add', 'No previous food found for this meal.');
      return;
    }

    quickAdd.mutate({ foodItemId: entry.foodItemId, mealSlot: slot, servings: entry.servings });
  };

  const repeatMealFromYesterday = (slot: MealSlot, previousEntries: DiaryEntry[]) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    repeatPreviousMeal.mutate({ mealSlot: slot, entries: previousEntries });
  };

  const quickAddSearchFood = (food: FoodItem) => {
    rememberSearch(food.name);
    void Haptics.selectionAsync();
    navigation.navigate('FoodEntryDetails', { food, mealSlot: lastUsedSearchMealSlot, localDate });
  };

  const openSearchFoodDetails = (food: FoodItem) => {
    rememberSearch(food.name);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('FoodEntryDetails', { food, mealSlot: lastUsedSearchMealSlot, localDate });
  };

  const showSearchFilter = (filter: SearchFilter) => {
    setSearchFilter(filter);
    setTab('search');
  };

  const promptEditNumericTarget = ({
    title,
    message,
    currentValue,
    min,
    max,
    onSubmit,
  }: {
    title: string;
    message: string;
    currentValue: string;
    min: number;
    max: number;
    onSubmit: (value: string) => void;
  }) => {
    Alert.prompt(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          isPreferred: true,
          onPress: (value?: string | { login: string; password: string }) => {
            const nextRaw = typeof value === 'string' ? value : '';
            const parsed = parseGoalInput(nextRaw);
            if (parsed === null || parsed < min || parsed > max) {
              Alert.alert(title, `Enter a value between ${min} and ${max}.`);
              return;
            }
            onSubmit(String(Math.round(parsed)));
          },
        },
      ],
      'plain-text',
      currentValue,
      'number-pad',
    );
  };

  const saveGoalSettings = () => {
    const calorieTargetInput = parseGoalInput(goalDraft.calorieTarget);
    const proteinTargetInput = parseGoalInput(goalDraft.proteinTargetG);
    const carbTargetInput = parseGoalInput(goalDraft.carbTargetG);
    const fatTargetInput = parseGoalInput(goalDraft.fatTargetG);
    const waterTargetInput = parseGoalInput(goalDraft.waterTargetMl);
    const mealsPerDayInput = parseGoalInput(goalDraft.mealsPerDayTarget);

    if (
      calorieTargetInput === null ||
      proteinTargetInput === null ||
      carbTargetInput === null ||
      fatTargetInput === null ||
      waterTargetInput === null ||
      mealsPerDayInput === null
    ) {
      Alert.alert('Goals', 'Enter valid numbers for all targets.');
      return;
    }

    if (calorieTargetInput < 900 || calorieTargetInput > 7000) {
      Alert.alert('Goals', 'Daily calorie target should be between 900 and 7000 kcal.');
      return;
    }
    if (proteinTargetInput < 20 || proteinTargetInput > 400) {
      Alert.alert('Goals', 'Protein target should be between 20 and 400 g.');
      return;
    }
    if (carbTargetInput < 20 || carbTargetInput > 700) {
      Alert.alert('Goals', 'Carb target should be between 20 and 700 g.');
      return;
    }
    if (fatTargetInput < 10 || fatTargetInput > 300) {
      Alert.alert('Goals', 'Fat target should be between 10 and 300 g.');
      return;
    }
    if (waterTargetInput < 250 || waterTargetInput > 8000) {
      Alert.alert('Goals', 'Water target should be between 250 and 8000 ml.');
      return;
    }
    if (mealsPerDayInput < 1 || mealsPerDayInput > 12) {
      Alert.alert('Goals', 'Meals target should be between 1 and 12 per day.');
      return;
    }

    saveGoalSettingsMutation.mutate({
      goal: goalDraft.goal,
      calorieTarget: Math.round(calorieTargetInput),
      proteinTargetG: Math.round(proteinTargetInput),
      carbTargetG: Math.round(carbTargetInput),
      fatTargetG: Math.round(fatTargetInput),
      waterTargetMl: Math.round(waterTargetInput),
      mealsPerDayTarget: Math.round(mealsPerDayInput),
    });
  };

  const editCalorieTarget = () =>
    promptEditNumericTarget({
      title: 'Daily calories',
      message: 'Set your daily calorie target.',
      currentValue: goalDraft.calorieTarget,
      min: 900,
      max: 7000,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, calorieTarget: value })),
    });

  const editProteinTarget = () =>
    promptEditNumericTarget({
      title: 'Protein target',
      message: 'Set daily protein in grams.',
      currentValue: goalDraft.proteinTargetG,
      min: 20,
      max: 400,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, proteinTargetG: value })),
    });

  const editCarbTarget = () =>
    promptEditNumericTarget({
      title: 'Carb target',
      message: 'Set daily carbs in grams.',
      currentValue: goalDraft.carbTargetG,
      min: 20,
      max: 700,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, carbTargetG: value })),
    });

  const editFatTarget = () =>
    promptEditNumericTarget({
      title: 'Fat target',
      message: 'Set daily fat in grams.',
      currentValue: goalDraft.fatTargetG,
      min: 10,
      max: 300,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, fatTargetG: value })),
    });

  const editWaterTarget = () =>
    promptEditNumericTarget({
      title: 'Water target',
      message: 'Set daily water target in ml.',
      currentValue: goalDraft.waterTargetMl,
      min: 250,
      max: 8000,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, waterTargetMl: value })),
    });

  const editMealsTarget = () =>
    promptEditNumericTarget({
      title: 'Meals target',
      message: 'Set meals target per day.',
      currentValue: goalDraft.mealsPerDayTarget,
      min: 1,
      max: 12,
      onSubmit: (value) => setGoalDraft((current) => ({ ...current, mealsPerDayTarget: value })),
    });

  const logMealFromGoals = () => {
    void Haptics.selectionAsync();
    navigation.navigate('FoodSearch', { mealSlot: defaultSavedMealSlot, localDate });
  };

  const logWaterFromGoals = () => {
    if (quickLogWaterMutation.isPending) return;
    quickLogWaterMutation.mutate(250);
  };

  const quickAddSavedMeal = (meal: SavedMeal) => {
    if (quickAddSavedMealMutation.isPending && quickAddSavedMealMutation.variables?.savedMealId === meal.id) {
      return;
    }
    void Haptics.selectionAsync();
    quickAddSavedMealMutation.mutate({
      savedMealId: meal.id,
      mealSlot: resolveSavedMealSlot(meal, defaultSavedMealSlot),
    });
  };

  const promptRenameSavedMeal = (meal: SavedMeal) => {
    Alert.prompt(
      'Edit meal',
      'Update saved meal name.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          isPreferred: true,
          onPress: (value?: string | { login: string; password: string }) => {
            const nextName = typeof value === 'string' ? value.trim() : '';
            if (!nextName.length) {
              Alert.alert('Edit meal', 'Meal name cannot be empty.');
              return;
            }
            if (nextName === meal.name) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            renameSavedMealMutation.mutate({ savedMealId: meal.id, name: nextName });
          },
        },
      ],
      'plain-text',
      meal.name,
    );
  };

  const duplicateMealCard = (meal: SavedMeal) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    duplicateSavedMealMutation.mutate({ savedMeal: meal });
  };

  const confirmDeleteSavedMeal = (meal: SavedMeal) => {
    Alert.alert('Delete meal', `Delete "${meal.name}" from saved meals?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteSavedMealMutation.mutate({ savedMealId: meal.id });
        },
      },
    ]);
  };

  const quickAddingMealId = quickAddSavedMealMutation.isPending ? quickAddSavedMealMutation.variables?.savedMealId : undefined;
  const renamingMealId = renameSavedMealMutation.isPending ? renameSavedMealMutation.variables?.savedMealId : undefined;
  const duplicatingMealId = duplicateSavedMealMutation.isPending ? duplicateSavedMealMutation.variables?.savedMeal.id : undefined;
  const deletingMealId = deleteSavedMealMutation.isPending ? deleteSavedMealMutation.variables?.savedMealId : undefined;

  const onHeaderAction = () => {
    if (tab === 'meals') {
      Alert.alert('Meals', 'Custom meal builder can be opened from this action.');
      return;
    }
    if (tab === 'goals') {
      saveGoalSettings();
      return;
    }
    navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate });
  };

  const headerAction = tab === 'goals'
    ? { label: saveGoalSettingsMutation.isPending ? 'Saving...' : 'Save goals', icon: Target }
    : tab === 'meals'
      ? { label: 'Add custom meal', icon: Plus }
      : { label: 'Add food', icon: Plus };

  if (diary.isLoading || profile.isLoading || nutritionLibrary.isLoading || recentFoods.isLoading || mealsPerDayTarget.isLoading) {
    return (
      <NutritionScreen resetScrollOnBlur>
        <LoadingState label="Loading nutrition" />
      </NutritionScreen>
    );
  }

  if (!diaryData || !goals) {
    return (
      <NutritionScreen resetScrollOnBlur>
        <EmptyState icon={Target} title="Nutrition data unavailable" body="Try reloading once profile and diary data are ready." />
      </NutritionScreen>
    );
  }

  const renderTabs = () => (
    <View style={styles.tabShell}>
      {NUTRITION_TABS.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={({ pressed }) => [
              styles.tabItem,
              {
                backgroundColor: active ? 'rgba(44,53,64,0.82)' : 'transparent',
                borderBottomColor: active ? theme.colors.primary : 'transparent',
                opacity: pressed ? 0.84 : 1,
              },
            ]}
          >
            <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.text : theme.colors.muted }}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  const renderDiaryTab = () => (
    <View style={styles.diaryFlow}>
      <CaloriesDashboardCard
        calories={calories}
        target={calorieTarget}
        remaining={remainingCalories}
        progress={calorieProgress}
        protein={protein}
        carbs={carbs}
        fat={fat}
        goals={goals}
        feedback={calorieFeedback}
      />

      <CalorieStreakBadge streak={calorieStreak.data ?? 0} isLoading={calorieStreak.isLoading} />

      <WeeklyCaloriesCard points={weeklyCaloriesPoints} isLoading={weeklyCalories.isLoading} />

      <View style={styles.mealCardsStack}>
        {mealSections.map((section) => (
          <MealSummaryCard
            key={section.slot}
            label={section.label}
            calories={section.calories}
            count={section.count}
            calorieTarget={calorieTarget}
            entries={section.entries}
            previousEntries={section.previousEntries}
            expanded={expandedMealSlots.has(section.slot)}
            icon={section.icon}
            color={section.color}
            tint={section.tint}
            onToggle={() => toggleMealSlot(section.slot)}
            onAddFood={() => navigation.navigate('FoodSearch', { mealSlot: section.slot, localDate })}
            onQuickAddLastFood={() => quickAddLastMealFood(section.slot, section.entries, section.previousEntries)}
            onRepeatPreviousMeal={() => repeatMealFromYesterday(section.slot, section.previousEntries)}
          />
        ))}
      </View>

      <NutritionButton label="Log meal" icon={Plus} onPress={() => navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate })} style={styles.primaryCta} />

      <NutritionCard onPress={() => navigation.navigate('BarcodeScanner', { mealSlot: 'lunch', localDate })} style={styles.secondaryQuickAction}>
        <View style={styles.quickActionCopy}>
          <View style={[styles.barcodeIconWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Barcode size={20} color={theme.colors.primary} />
          </View>
          <View>
            <AppText weight="800">Barcode scanner</AppText>
            <AppText muted>Quick add packaged food</AppText>
          </View>
        </View>
        <ChevronRight size={20} color={theme.colors.muted} />
      </NutritionCard>
    </View>
  );

  const renderSearchTab = () => (
    <>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Search size={20} color={theme.colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search foods..."
            placeholderTextColor={theme.colors.muted}
            style={[styles.searchInput, { color: theme.colors.text }]}
            onSubmitEditing={() => rememberSearch(searchQuery)}
          />
        </View>
        <Pressable
          onPress={() => navigation.navigate('BarcodeScanner', { mealSlot: activeSearchMealSlot, localDate })}
          style={({ pressed }) => [
            styles.searchAction,
            { opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <Barcode size={20} color={theme.colors.primary} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {SEARCH_FILTERS.map((chip) => {
          const active = chip === searchFilter;
          return (
            <Pressable
              key={chip}
              onPress={() => setSearchFilter(chip)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? 'rgba(53,199,122,0.14)' : 'rgba(31,39,48,0.42)',
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                {chip}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <FoodSuggestionStrip suggestions={frequentlyLoggedFoods.data ?? []} onSelect={quickAddSearchFood} onLongPress={openSearchFoodDetails} />

      <View style={styles.searchResultsHeader}>
        <AppText variant="section">Search results</AppText>
        <SlidersHorizontal size={17} color={theme.colors.muted} />
      </View>

      {searchedFoods.isLoading && searchQuery.trim().length ? (
        <LoadingState label="Searching foods" />
      ) : filteredSearchResults.length ? (
        filteredSearchResults.map((food) => (
          <NutritionCard key={food.id} style={styles.foodCard}>
            <View style={styles.foodRow}>
              <View style={[styles.foodThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Utensils size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.foodCopy}>
                <AppText weight="800" numberOfLines={2} style={styles.foodTitle}>
                  {food.name}
                </AppText>
                <AppText muted variant="small" style={styles.foodMeta}>
                  {food.calories} kcal • per {food.servingSize} {food.servingUnit}
                </AppText>
                <FoodMacroChips protein={food.proteinG} carbs={food.carbsG} fat={food.fatG} />
              </View>
              <Pressable
                accessibilityRole="button"
                onLongPress={() => openSearchFoodDetails(food)}
                onPress={() => quickAddSearchFood(food)}
                style={({ pressed }) => [
                  styles.quickAddButton,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    opacity: pressed ? 0.78 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Plus size={18} color={theme.colors.primary} />
              </Pressable>
            </View>
          </NutritionCard>
        ))
      ) : (
        <EmptyState
          icon={Search}
          title="No results"
          body="Try another query or switch filters."
          actionLabel="Show all"
          onAction={() => {
            setSearchQuery('');
            setSearchFilter('All');
          }}
        />
      )}

      <View style={styles.recentSearchHeader}>
        <AppText variant="section">Recent searches</AppText>
        <Pressable onPress={() => setManualRecentSearches([])}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            Clear
          </AppText>
        </Pressable>
      </View>
      <View style={styles.recentSearchChips}>
        {recentSearches.length ? (
          recentSearches.map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setSearchQuery(item);
                setSearchFilter('All');
                rememberSearch(item);
              }}
              style={({ pressed }) => [
                styles.recentChip,
                { opacity: pressed ? 0.84 : 1 },
              ]}
            >
              <AppText muted>{item}</AppText>
            </Pressable>
          ))
        ) : (
          <AppText muted>No recent searches yet</AppText>
        )}
      </View>
    </>
  );

  const renderMealsTab = () => (
    <>
      <View style={styles.sectionTitleRow}>
        <AppText variant="title" style={styles.sectionTitle}>
          Saved meals
        </AppText>
      </View>

      {mealCards.length ? (
        mealCards.map(({ meal, icon: Icon, totals, ingredients }) => (
          <SavedMealCard
            key={meal.id}
            meal={meal}
            icon={Icon}
            totals={totals}
            ingredients={ingredients}
            recentlyAdded={recentlyAddedSavedMealId === meal.id}
            quickAddPending={quickAddingMealId === meal.id}
            editPending={renamingMealId === meal.id}
            duplicatePending={duplicatingMealId === meal.id}
            deletePending={deletingMealId === meal.id}
            onQuickAdd={() => quickAddSavedMeal(meal)}
            onEdit={() => promptRenameSavedMeal(meal)}
            onDuplicate={() => duplicateMealCard(meal)}
            onDelete={() => confirmDeleteSavedMeal(meal)}
          />
        ))
      ) : (
        <EmptyState icon={Soup} title="No saved meals yet" body="Create custom meals to speed up daily logging." />
      )}

      <View style={styles.sectionTitleRow}>
        <AppText variant="section">Favorites</AppText>
        <Pressable onPress={() => showSearchFilter('Favorites')}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            View all
          </AppText>
        </Pressable>
      </View>

      {favoriteMeals.length ? (
        favoriteMeals.map(({ meal, icon: Icon, totals, ingredients }) => (
          <NutritionCard key={`fav-${meal.id}`} style={styles.favoriteCard}>
            <View style={styles.favoriteRow}>
              <View style={[styles.favoriteThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Icon size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.favoriteCopy}>
                <AppText weight="800" numberOfLines={1}>
                  {meal.name}
                </AppText>
                <AppText muted numberOfLines={1} style={styles.favoritePreview}>
                  {ingredients}
                </AppText>
                <AppText weight="800" style={styles.favoriteCalories}>
                  {totals.calories} kcal
                </AppText>
                <MealMacroVisual protein={totals.protein} carbs={totals.carbs} fat={totals.fat} compact />
              </View>
              <Star size={20} color={theme.colors.warning} fill={theme.colors.warning} />
            </View>
          </NutritionCard>
        ))
      ) : (
        <NutritionCard>
          <AppText muted>No favorites yet.</AppText>
        </NutritionCard>
      )}

      <View style={styles.sectionTitleRow}>
        <AppText variant="section">Recent meals</AppText>
        <Pressable onPress={() => showSearchFilter('Recent')}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            View all
          </AppText>
        </Pressable>
      </View>

      {recentMealsPreview.length ? (
        recentMealsPreview.map((food) => (
          <NutritionCard key={`recent-meal-${food.id}`} style={styles.favoriteCard}>
            <View style={styles.favoriteRow}>
              <View style={[styles.favoriteThumb, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Utensils size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.favoriteCopy}>
                <AppText weight="800" numberOfLines={1}>
                  {food.name}
                </AppText>
                <AppText muted numberOfLines={1} style={styles.favoritePreview}>
                  {foodIngredientPreview(food)}
                </AppText>
                <AppText weight="800" style={styles.favoriteCalories}>
                  {food.calories} kcal
                </AppText>
                <MealMacroVisual protein={roundMetric(food.proteinG)} carbs={roundMetric(food.carbsG)} fat={roundMetric(food.fatG)} compact />
              </View>
              <ChevronRight size={20} color={theme.colors.muted} />
            </View>
          </NutritionCard>
        ))
      ) : (
        <NutritionCard>
          <AppText muted>No recent meals yet.</AppText>
        </NutritionCard>
      )}
    </>
  );

  const renderGoalsTab = () => {
    const calorieTarget = parseGoalInput(goalDraft.calorieTarget) ?? 0;
    const proteinTarget = parseGoalInput(goalDraft.proteinTargetG) ?? 0;
    const carbTarget = parseGoalInput(goalDraft.carbTargetG) ?? 0;
    const fatTarget = parseGoalInput(goalDraft.fatTargetG) ?? 0;
    const waterTarget = parseGoalInput(goalDraft.waterTargetMl) ?? 0;
    const mealsTarget = parseGoalInput(goalDraft.mealsPerDayTarget) ?? 0;
    const proteinKcal = Math.max(0, proteinTarget) * 4;
    const carbKcal = Math.max(0, carbTarget) * 4;
    const fatKcal = Math.max(0, fatTarget) * 9;
    const totalMacroKcal = proteinKcal + carbKcal + fatKcal;
    const proteinPct = totalMacroKcal > 0 ? Math.round((proteinKcal / totalMacroKcal) * 100) : 0;
    const carbsPct = totalMacroKcal > 0 ? Math.round((carbKcal / totalMacroKcal) * 100) : 0;
    const fatPct = totalMacroKcal > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

    return (
      <>
        <View style={styles.goalSettingsHeader}>
          <AppText variant="title" style={styles.sectionTitle}>
            Goal settings
          </AppText>
          <AppText muted>Set your targets and nutrition plan.</AppText>
        </View>

        <NutritionCard style={styles.goalSettingsCard}>
          <AppText variant="section">Goal type</AppText>
          <View style={styles.goalTypeSelector}>
            {GOAL_TYPE_OPTIONS.map((option) => {
              const active = goalDraft.goal === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setGoalDraft((current) => ({ ...current, goal: option.key }))}
                  style={({ pressed }) => [
                    styles.goalTypeChip,
                    {
                      backgroundColor: active ? 'rgba(53,199,122,0.16)' : 'rgba(31,39,48,0.36)',
                      borderColor: active ? 'rgba(53,199,122,0.38)' : 'transparent',
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <AppText weight={active ? '800' : '700'} style={{ color: active ? theme.colors.primary : theme.colors.text }}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </NutritionCard>

        <NutritionCard style={styles.goalSettingsCard}>
          <AppText variant="section">Nutrition targets</AppText>

          <Pressable accessibilityRole="button" onPress={editCalorieTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Daily calories</AppText>
              <AppText muted variant="small">
                Tap to edit
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(calorieTarget)} kcal</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={editProteinTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Protein</AppText>
              <AppText muted variant="small">
                Tap to edit
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(proteinTarget)} g</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={editCarbTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Carbs</AppText>
              <AppText muted variant="small">
                Tap to edit
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(carbTarget)} g</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={editFatTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Fat</AppText>
              <AppText muted variant="small">
                Tap to edit
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(fatTarget)} g</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>
        </NutritionCard>

        <NutritionCard style={styles.goalSettingsCard}>
          <AppText variant="section">Daily habits</AppText>

          <Pressable accessibilityRole="button" onPress={editWaterTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Water target</AppText>
              <AppText muted variant="small">
                Tap to adjust
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(waterTarget)} ml</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>
          <View style={styles.goalInlineActions}>
            <Pressable
              accessibilityRole="button"
              disabled={quickLogWaterMutation.isPending}
              onPress={logWaterFromGoals}
              style={({ pressed }) => [styles.goalActionChip, { opacity: quickLogWaterMutation.isPending ? 0.52 : pressed ? 0.82 : 1 }]}
            >
              <Droplets size={15} color={theme.colors.info} />
              <AppText weight="800" style={{ color: theme.colors.info }}>
                {quickLogWaterMutation.isPending ? 'Logging...' : 'Log +250 ml'}
              </AppText>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" onPress={editMealsTarget} style={({ pressed }) => [styles.goalValueRow, { opacity: pressed ? 0.82 : 1 }]}>
            <View style={styles.goalValueCopy}>
              <AppText weight="700">Meals target</AppText>
              <AppText muted variant="small">
                Tap to adjust
              </AppText>
            </View>
            <View style={styles.goalValueTrail}>
              <AppText weight="800">{Math.round(mealsTarget)} / day</AppText>
              <ChevronRight size={16} color={theme.colors.muted} />
            </View>
          </Pressable>
          <View style={styles.goalInlineActions}>
            <Pressable accessibilityRole="button" onPress={logMealFromGoals} style={({ pressed }) => [styles.goalActionChip, { opacity: pressed ? 0.82 : 1 }]}>
              <Plus size={15} color={theme.colors.primary} />
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                Log meal
              </AppText>
            </Pressable>
          </View>
        </NutritionCard>

        <NutritionCard style={styles.goalSettingsCard}>
          <View style={styles.goalSplitHeader}>
            <AppText variant="section">Macro split</AppText>
            <AppText muted>{proteinPct + carbsPct + fatPct}%</AppText>
          </View>
          <View style={styles.goalSplitList}>
            <View style={styles.goalSplitRow}>
              <View style={styles.goalSplitLabelRow}>
                <View style={[styles.goalSplitDot, { backgroundColor: theme.colors.primary }]} />
                <AppText>Protein</AppText>
              </View>
              <AppText weight="800">{proteinPct}%</AppText>
            </View>
            <View style={styles.goalSplitRow}>
              <View style={styles.goalSplitLabelRow}>
                <View style={[styles.goalSplitDot, { backgroundColor: theme.colors.info }]} />
                <AppText>Carbs</AppText>
              </View>
              <AppText weight="800">{carbsPct}%</AppText>
            </View>
            <View style={styles.goalSplitRow}>
              <View style={styles.goalSplitLabelRow}>
                <View style={[styles.goalSplitDot, { backgroundColor: theme.colors.warning }]} />
                <AppText>Fat</AppText>
              </View>
              <AppText weight="800">{fatPct}%</AppText>
            </View>
          </View>
        </NutritionCard>

        <NutritionCard style={styles.goalSettingsCard}>
          <AppText variant="section">Strategy</AppText>
          <AppText muted>{strategyCopy(goalDraft.goal)}</AppText>
        </NutritionCard>

        <NutritionButton
          label={saveGoalSettingsMutation.isPending ? 'Saving...' : 'Save settings'}
          icon={Target}
          onPress={saveGoalSettings}
          disabled={saveGoalSettingsMutation.isPending}
          style={styles.primaryCta}
        />
      </>
    );
  };

  return (
    <NutritionScreen resetScrollOnBlur>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Nutrition</AppText>
          <AppText muted>Log food, meals, and goals.</AppText>
        </View>
        <NutritionButton
          label={headerAction.label}
          icon={headerAction.icon}
          variant="soft"
          onPress={onHeaderAction}
          disabled={tab === 'goals' && saveGoalSettingsMutation.isPending}
          style={styles.headerAction}
        />
      </View>

      {renderTabs()}

      {tab === 'diary' ? renderDiaryTab() : null}
      {tab === 'search' ? renderSearchTab() : null}
      {tab === 'meals' ? renderMealsTab() : null}
      {tab === 'goals' ? renderGoalsTab() : null}
    </NutritionScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerAction: {
    minHeight: 50,
    minWidth: 122,
  },
  tabShell: {
    backgroundColor: 'rgba(22,28,35,0.7)',
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  tabItem: {
    alignItems: 'center',
    borderBottomWidth: 3,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  diaryFlow: {
    gap: 18,
  },
  caloriesDashboardCard: {
    gap: 18,
    padding: 16,
    position: 'relative',
  },
  calorieStreakBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  calorieStreakLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  weeklyCaloriesCard: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  weeklyCaloriesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weeklyCaloriesChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    minHeight: 68,
  },
  weeklyCaloriesBarItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  weeklyCaloriesBarTrack: {
    borderRadius: 999,
    height: 52,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 8,
  },
  weeklyCaloriesBarFill: {
    borderRadius: 999,
    width: '100%',
  },
  weeklyCaloriesLabel: {
    fontSize: 10,
    opacity: 0.78,
  },
  calorieHero: {
    alignItems: 'center',
    height: 254,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  calorieHeroRing: {
    height: 264,
    left: '50%',
    marginLeft: -132,
    opacity: 0.92,
    position: 'absolute',
    top: -2,
    width: 264,
  },
  calorieHeroCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 190,
    paddingHorizontal: 16,
  },
  calorieFeedbackBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: 'absolute',
    top: 8,
  },
  calorieHeroLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  calorieHeroValueRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  calorieHeroValue: {
    fontSize: 58,
    fontWeight: '800',
    lineHeight: 64,
  },
  calorieHeroUnit: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 8,
  },
  calorieHeroLeft: {
    fontSize: 18,
    lineHeight: 24,
    marginTop: 6,
  },
  calorieHeroTarget: {
    marginTop: 4,
  },
  macroDashboardRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroDashboardItem: {
    flex: 1,
    borderRadius: 12,
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 112,
    minWidth: 0,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
  },
  macroDashboardGlow: {
    borderRadius: 50,
    height: 72,
    opacity: 0.1,
    position: 'absolute',
    right: -32,
    top: -28,
    width: 72,
  },
  macroDashboardAccent: {
    height: 3,
    left: 0,
    opacity: 0.85,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  macroDashboardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroDashboardLabelRow: {
    alignItems: 'center',
    flexShrink: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  macroDashboardDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  macroPercentPill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  macroDashboardValue: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 27,
  },
  thinProgressTrack: {
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
  },
  thinProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  mealCardsStack: {
    gap: 22,
    marginTop: 12,
  },
  mealSummaryCard: {
    borderRadius: 12,
    gap: 12,
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 14,
    position: 'relative',
  },
  mealSwipeAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 2,
    minWidth: 116,
    paddingHorizontal: 16,
  },
  mealSwipeLeft: {
    borderBottomLeftRadius: 12,
    borderTopLeftRadius: 12,
  },
  mealSwipeRight: {
    borderBottomRightRadius: 12,
    borderTopRightRadius: 12,
  },
  mealSwipePrimaryText: {
    color: '#06100B',
  },
  mealCardGlow: {
    borderRadius: 80,
    height: 120,
    opacity: 0.07,
    position: 'absolute',
    right: -48,
    top: -44,
    width: 120,
  },
  mealSummaryMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  mealSummaryIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  mealSummaryCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  mealSummaryTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  mealSummaryTitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  mealLastFood: {
    marginTop: 2,
  },
  mealProgressTrack: {
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
    width: '100%',
  },
  mealProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  mealExpandedContent: {
    gap: 10,
    paddingTop: 2,
  },
  mealFoodRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,18,0.2)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mealFoodDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  mealFoodCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  mealEmptyRow: {
    backgroundColor: 'rgba(10,14,18,0.16)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  mealInlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mealActionPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,18,0.18)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  primaryCta: {
    minHeight: 56,
  },
  secondaryQuickAction: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 14,
  },
  quickActionCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  barcodeIconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(28,35,43,0.82)',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 7,
  },
  searchAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(28,35,43,0.82)',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 14,
    minHeight: 35,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  searchResultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foodCard: {
    gap: 0,
    padding: 14,
  },
  foodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minHeight: 90,
  },
  foodThumb: {
    alignItems: 'center',
    borderRadius: 10,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  foodCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  foodTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  foodMeta: {
    opacity: 0.72,
  },
  quickAddButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  recentSearchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recentSearchChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    backgroundColor: 'rgba(31,39,48,0.42)',
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  savedMealCard: {
    gap: 0,
  },
  savedMealCardAdded: {
    shadowColor: '#35C77A',
    shadowOpacity: 0.26,
    shadowRadius: 18,
  },
  savedMealSwipeActionsLeft: {
    alignItems: 'stretch',
    justifyContent: 'center',
    marginVertical: 2,
    minWidth: 120,
  },
  savedMealSwipeActionsRight: {
    alignItems: 'stretch',
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 2,
    minWidth: 232,
  },
  savedMealSwipeAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minWidth: 112,
    paddingHorizontal: 14,
  },
  savedMealSwipeLeftAction: {
    borderBottomLeftRadius: 12,
    borderTopLeftRadius: 12,
  },
  savedMealSwipeMiddleAction: {
    borderBottomLeftRadius: 12,
    borderTopLeftRadius: 12,
  },
  savedMealSwipeRightAction: {
    borderBottomRightRadius: 12,
    borderTopRightRadius: 12,
  },
  savedMealSwipeLabelPrimary: {
    color: '#041016',
  },
  savedMealRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  savedMealThumb: {
    alignItems: 'center',
    borderRadius: 10,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  savedMealCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  savedMealTitle: {
    fontSize: 17,
    lineHeight: 21,
  },
  savedMealPreview: {
    opacity: 0.76,
  },
  savedMealCalories: {
    fontSize: 15,
    lineHeight: 19,
  },
  savedMealTrail: {
    alignItems: 'flex-end',
    gap: 8,
    justifyContent: 'center',
    minWidth: 68,
  },
  savedMacroRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  savedMacroCell: {
    flex: 1,
    gap: 1,
  },
  savedMacroDivider: {
    height: 34,
    width: StyleSheet.hairlineWidth,
  },
  favoriteCard: {
    gap: 0,
  },
  favoriteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  favoriteThumb: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  favoriteCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  favoritePreview: {
    opacity: 0.76,
  },
  favoriteCalories: {
    fontSize: 14,
    lineHeight: 18,
  },
  mealsMacroWrap: {
    gap: 6,
  },
  mealsMacroTrack: {
    borderRadius: 999,
    flexDirection: 'row',
    gap: 2,
    height: 6,
    overflow: 'hidden',
  },
  mealsMacroFill: {
    borderRadius: 999,
    height: '100%',
    minWidth: 6,
  },
  mealsMacroLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealsMacroLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  mealsMacroDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  goalSettingsHeader: {
    gap: 4,
  },
  goalSettingsCard: {
    gap: 10,
    padding: 14,
  },
  goalTypeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  goalTypeChip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  goalValueRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.34)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(90,102,116,0.45)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 10,
  },
  goalValueCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  goalValueTrail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  goalInlineActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  goalActionChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.42)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  goalSplitHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalSplitList: {
    gap: 8,
  },
  goalSplitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalSplitLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  goalSplitDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
});
