import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import {
  addWater,
  addDiaryEntry,
  deleteDiaryEntry,
  deleteSavedMeal,
  duplicateSavedMeal,
  logSavedMeal,
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
} from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { FoodSuggestionStrip } from '@/features/nutrition/components/FoodSuggestionStrip';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { DateNavigator } from '@/components/DateNavigator';
import { resolveLastUsedMealSlot } from '@/features/nutrition/utils/foodLogInteractions';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NutritionTab = 'diary' | 'search' | 'meals' | 'goals';
type DiaryMealFilter = 'all' | MealSlot;
type SearchFilter = 'All' | 'Recent' | 'Favorites' | 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
type NutritionLibraryData = { savedMeals: SavedMeal[]; recipes: unknown[] };
type GoalEditorType = Extract<GoalType, 'lose' | 'gain' | 'maintain'>;

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

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
}

function entryCalories(entry: DiaryEntry): number {
  return entry.totalCalories ?? entry.caloriesSnapshot * entry.servings;
}

function mealTotals(savedMeal: SavedMeal, foodsById: Map<string, FoodItem>) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const item of savedMeal.items) {
    if (
      item.totalCalories != null &&
      item.totalProteinG != null &&
      item.totalCarbsG != null &&
      item.totalFatG != null
    ) {
      totals.calories += item.totalCalories;
      totals.protein += item.totalProteinG;
      totals.carbs += item.totalCarbsG;
      totals.fat += item.totalFatG;
      continue;
    }

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

function lastMealFoodLabel(entries: DiaryEntry[]): string {
  if (!entries.length) return 'No food logged yet';
  return entries[entries.length - 1].foodNameSnapshot;
}

function CompactMacroStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.compactMacroStat}>
      <View style={[styles.compactMacroDot, { backgroundColor: color }]} />
      <AppText muted variant="small" weight="700" numberOfLines={1}>
        {label}
      </AppText>
      <AppText weight="800" numberOfLines={1}>
        {value}g
      </AppText>
    </View>
  );
}

function CompactNutritionSummary({
  calories,
  target,
  progress,
  protein,
  carbs,
  fat,
  detailsExpanded,
  onToggleDetails,
}: {
  calories: number;
  target: number;
  progress: number;
  protein: number;
  carbs: number;
  fat: number;
  detailsExpanded: boolean;
  onToggleDetails: () => void;
}) {
  const theme = useAppTheme();
  const DetailsChevron = detailsExpanded ? ChevronUp : ChevronDown;

  return (
    <NutritionCard style={styles.compactSummaryCard}>
      <View style={styles.compactSummaryTop}>
        <View style={styles.compactCaloriesBlock}>
          <AppText muted variant="small" weight="800" style={styles.compactSummaryLabel}>
            Today
          </AppText>
          <View style={styles.compactCaloriesRow}>
            <AppText style={styles.compactCaloriesValue}>{calories}</AppText>
            <AppText weight="800" style={styles.compactCaloriesUnit}>
              kcal
            </AppText>
          </View>
          <AppText muted variant="small">
            {target > 0 ? `${progressPercent(progress)}% of ${target} kcal` : 'No calorie target set'}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onToggleDetails}
          style={({ pressed }) => [styles.compactDetailsButton, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.82 : 1 }]}
        >
          <AppText weight="800">{detailsExpanded ? 'Hide' : 'Details'}</AppText>
          <DetailsChevron size={16} color={theme.colors.muted} />
        </Pressable>
      </View>

      <View style={styles.compactSummaryTrack}>
        <View style={[styles.compactSummaryFill, { backgroundColor: theme.colors.primary, width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.compactMacroRow}>
        <CompactMacroStat label="Protein" value={protein} color={theme.colors.primary} />
        <CompactMacroStat label="Carbs" value={carbs} color={theme.colors.info} />
        <CompactMacroStat label="Fat" value={fat} color={theme.colors.warning} />
      </View>
    </NutritionCard>
  );
}

function DetailMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.detailMetric}>
      <View style={[styles.detailMetricDot, { backgroundColor: color }]} />
      <AppText muted variant="small">
        {label}
      </AppText>
      <AppText weight="800">{value}</AppText>
    </View>
  );
}

function DailyNutritionDetails({
  calories,
  target,
  remaining,
  progress,
  protein,
  carbs,
  fat,
  goals,
  waterMl,
  streak,
  streakLoading,
}: {
  calories: number;
  target: number;
  remaining: number;
  progress: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: GoalSettings;
  waterMl: number;
  streak: number;
  streakLoading: boolean;
}) {
  const theme = useAppTheme();

  return (
    <NutritionCard style={styles.dailyDetailsCard}>
      <View style={styles.dailyDetailsHeader}>
        <AppText variant="section">Daily details</AppText>
        <AppText weight="800" style={{ color: remaining >= 0 ? theme.colors.primary : theme.colors.warning }}>
          {remainingCalorieLabel(remaining)}
        </AppText>
      </View>

      <View style={styles.detailsProgressBlock}>
        <View style={styles.detailsProgressLabels}>
          <AppText muted variant="small">
            Calories
          </AppText>
          <AppText muted variant="small">
            {calories} / {target} kcal
          </AppText>
        </View>
        <View style={[styles.detailProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
          <View style={[styles.detailProgressFill, { backgroundColor: theme.colors.primary, width: `${progress * 100}%` }]} />
        </View>
      </View>

      <View style={styles.detailMetricsGrid}>
        <DetailMetric label="Protein" value={`${protein}/${roundMetric(goals.proteinTargetG)}g`} color={theme.colors.primary} />
        <DetailMetric label="Carbs" value={`${carbs}/${roundMetric(goals.carbTargetG)}g`} color={theme.colors.info} />
        <DetailMetric label="Fat" value={`${fat}/${roundMetric(goals.fatTargetG)}g`} color={theme.colors.warning} />
        <DetailMetric label="Water" value={`${roundMetric(waterMl)} ml`} color={theme.colors.info} />
      </View>

      <View style={[styles.streakInline, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Flame size={15} color={streak > 0 ? theme.colors.warning : theme.colors.muted} />
        <AppText muted variant="small" weight="700">
          {streakLoading ? 'Loading streak' : `${streak} day calorie streak`}
        </AppText>
      </View>
    </NutritionCard>
  );
}

function MealNavRow({
  active,
  sections,
  onSelect,
}: {
  active: DiaryMealFilter;
  sections: Array<{ slot: MealSlot; label: string; count: number }>;
  onSelect: (slot: DiaryMealFilter) => void;
}) {
  const theme = useAppTheme();
  const totalCount = sections.reduce((sum, section) => sum + section.count, 0);
  const items: Array<{ slot: DiaryMealFilter; label: string; count: number }> = [
    { slot: 'all', label: 'All', count: totalCount },
    ...sections,
  ];

  return (
    <View style={styles.mealNavRow}>
      {items.map((item) => {
        const selected = active === item.slot;
        return (
          <Pressable
            key={item.slot}
            accessibilityRole="button"
            onPress={() => onSelect(item.slot)}
            style={({ pressed }) => [
              styles.mealNavChip,
              {
                backgroundColor: selected ? 'rgba(53,199,122,0.15)' : 'rgba(31,39,48,0.42)',
                borderColor: selected ? 'rgba(53,199,122,0.34)' : 'transparent',
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <AppText weight={selected ? '800' : '700'} variant="small" numberOfLines={1} style={{ color: selected ? theme.colors.primary : theme.colors.text }}>
              {item.label}
            </AppText>
            <AppText muted variant="small" weight="700">
              {item.count}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function SavedMealPicker({
  mealSlot,
  savedMeals,
  foodsById,
  pendingMealId,
  onSelect,
  onClose,
}: {
  mealSlot: MealSlot;
  savedMeals: SavedMeal[];
  foodsById: Map<string, FoodItem>;
  pendingMealId?: string;
  onSelect: (meal: SavedMeal) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();

  return (
    <NutritionCard style={styles.savedMealPickerCard}>
      <View style={styles.savedMealPickerHeader}>
        <View>
          <AppText variant="section">Add saved meal</AppText>
          <AppText muted variant="small">
            Logging to {MEAL_SECTIONS.find((section) => section.slot === mealSlot)?.label ?? mealSlot}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            Close
          </AppText>
        </Pressable>
      </View>

      {savedMeals.length ? (
        savedMeals.map((meal) => {
          const totals = mealTotals(meal, foodsById);
          const pending = pendingMealId === meal.id;
          return (
            <Pressable
              key={meal.id}
              accessibilityRole="button"
              disabled={Boolean(pendingMealId)}
              onPress={() => onSelect(meal)}
              style={({ pressed }) => [styles.savedMealPickerRow, { opacity: pendingMealId ? (pending ? 0.72 : 0.48) : pressed ? 0.82 : 1 }]}
            >
              <View style={styles.savedMealPickerCopy}>
                <AppText weight="800" numberOfLines={1}>
                  {meal.name}
                </AppText>
                <AppText muted variant="small">
                  {meal.items.length} item{meal.items.length === 1 ? '' : 's'} - {totals.calories} kcal
                </AppText>
              </View>
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                {pending ? 'Adding...' : 'Add'}
              </AppText>
            </Pressable>
          );
        })
      ) : (
        <View style={styles.savedMealPickerEmpty}>
          <AppText muted>No saved meals yet.</AppText>
        </View>
      )}
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
  foodsById,
  expanded,
  icon: Icon,
  color,
  tint,
  onToggle,
  onAddFood,
  onAddDrink,
  onAddSavedMeal,
  onSaveMeal,
  onQuickAddLastFood,
  onRepeatPreviousMeal,
  onDeleteEntry,
  deletingEntryId,
}: {
  label: string;
  calories: number;
  count: number;
  calorieTarget: number;
  entries: DiaryEntry[];
  previousEntries: DiaryEntry[];
  foodsById: Map<string, FoodItem>;
  expanded: boolean;
  icon: ComponentType<LucideProps>;
  color: string;
  tint: string;
  onToggle: () => void;
  onAddFood: () => void;
  onAddDrink: () => void;
  onAddSavedMeal: () => void;
  onSaveMeal?: () => void;
  onQuickAddLastFood: () => void;
  onRepeatPreviousMeal: () => void;
  onDeleteEntry: (entry: DiaryEntry) => void;
  deletingEntryId?: string;
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
        <View style={styles.mealSummaryTopRow}>
          <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.mealSummaryToggle, { opacity: pressed ? 0.86 : 1 }]}>
            <View style={[styles.mealSummaryIcon, { backgroundColor: tint }]}>
              <Icon size={20} color={color} strokeWidth={2.4} />
            </View>
            <View style={styles.mealSummaryCopy}>
              <View style={styles.mealSummaryTitleRow}>
                <AppText weight="800" numberOfLines={1} style={styles.mealSummaryTitle}>
                  {label}
                </AppText>
                <AppText weight="800" variant="small" style={{ color }}>
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
            <ProgressChevron size={18} color={theme.colors.muted} />
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onAddFood} style={({ pressed }) => [styles.mealSummaryAddButton, { borderColor: color, opacity: pressed ? 0.78 : 1 }]}>
            <Plus size={15} color={color} strokeWidth={2.6} />
            <AppText weight="800" variant="small" style={{ color }}>
              Add
            </AppText>
          </Pressable>
        </View>

        <View style={[styles.mealProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
          <View style={[styles.mealProgressFill, { backgroundColor: color, width: `${progress * 100}%` }]} />
        </View>

        {expanded ? (
          <View style={styles.mealExpandedContent}>
            {entries.length ? (
              entries.map((entry) => {
                const entryFood = foodsById.get(entry.foodItemId);
                const unit = entryFood?.baseUnit ?? (entryFood?.itemType === 'drink' ? 'ml' : 'g');
                const quantityLabel =
                  entry.quantityType === 'gram' && Number.isFinite(entry.totalGrams) && (entry.totalGrams ?? 0) > 0
                    ? `${roundMetric(entry.totalGrams ?? 0)} ${unit}`
                    : entryFood?.servingMode === 'fixed_package' && entryFood.servingLabel
                      ? `${formatAmount(entry.servings)} × ${entryFood.servingLabel}`
                      : `${formatAmount(entry.servings)} serving${entry.servings === 1 ? '' : 's'}`;

                return (
                  <View key={entry.id} style={styles.mealFoodRow}>
                    <View style={[styles.mealFoodDot, { backgroundColor: color }]} />
                    <View style={styles.mealFoodCopy}>
                      <AppText weight="700" numberOfLines={1}>
                        {entry.foodNameSnapshot}
                      </AppText>
                      <AppText muted variant="small">
                        {quantityLabel}
                      </AppText>
                    </View>
                    <View style={styles.mealFoodTrail}>
                      <AppText weight="800" style={{ color }}>
                        {roundMetric(entryCalories(entry))} kcal
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(deletingEntryId)}
                        onPress={() => onDeleteEntry(entry)}
                        style={({ pressed }) => [
                          styles.mealFoodDeleteButton,
                          { opacity: deletingEntryId ? 0.45 : pressed ? 0.78 : 1 },
                        ]}
                      >
                        <Trash2 size={14} color={theme.colors.danger} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
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

              <Pressable accessibilityRole="button" onPress={onAddDrink} style={({ pressed }) => [styles.mealActionPill, { opacity: pressed ? 0.82 : 1 }]}>
                <Droplets size={16} color={color} strokeWidth={2.4} />
                <AppText weight="800" style={{ color }}>
                  Add drink
                </AppText>
                <ChevronRight size={16} color={theme.colors.muted} />
              </Pressable>

              <Pressable accessibilityRole="button" onPress={onAddSavedMeal} style={({ pressed }) => [styles.mealActionPill, { opacity: pressed ? 0.82 : 1 }]}>
                <Soup size={16} color={color} strokeWidth={2.4} />
                <AppText weight="800" style={{ color }}>
                  Add saved meal
                </AppText>
                <ChevronRight size={16} color={theme.colors.muted} />
              </Pressable>

              {entries.length > 1 && onSaveMeal ? (
                <Pressable accessibilityRole="button" onPress={onSaveMeal} style={({ pressed }) => [styles.mealActionPill, { opacity: pressed ? 0.82 : 1 }]}>
                  <Star size={16} color={color} strokeWidth={2.4} />
                  <AppText weight="800" style={{ color }}>
                    Save meal
                  </AppText>
                  <ChevronRight size={16} color={theme.colors.muted} />
                </Pressable>
              ) : null}
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
  addPending,
  duplicatePending,
  deletePending,
  onOpen,
  onAddToMeal,
  onDuplicate,
  onDelete,
}: {
  meal: SavedMeal;
  icon: ComponentType<LucideProps>;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  ingredients: string;
  recentlyAdded: boolean;
  addPending: boolean;
  duplicatePending: boolean;
  deletePending: boolean;
  onOpen: () => void;
  onAddToMeal: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const swipeableRef = useRef<Swipeable | null>(null);
  const actionPending = duplicatePending || deletePending;
  const tapDisabled = actionPending || addPending;

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
        onPress={() => runAction(onOpen)}
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
        <AppText weight="800">Open</AppText>
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
        <View style={styles.savedMealRow}>
          <Pressable
            accessibilityRole="button"
            disabled={tapDisabled}
            onPress={onOpen}
            style={({ pressed }) => [styles.savedMealMainTouch, { opacity: tapDisabled ? 0.62 : pressed ? 0.84 : 1 }]}
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
            <ChevronRight size={18} color={theme.colors.muted} />
          </Pressable>
          <View style={styles.savedMealTrail}>
            {recentlyAdded && !addPending ? (
              <AppText weight="800" style={{ color: theme.colors.primary }}>
                Added
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={addPending}
              onPress={() => runAction(onAddToMeal)}
              style={({ pressed }) => [
                styles.savedMealAddButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: addPending ? 0.52 : pressed ? 0.78 : 1,
                },
              ]}
            >
              <Plus size={14} color="#08100C" strokeWidth={2.8} />
              <AppText weight="800" variant="small" style={{ color: '#08100C' }}>
                {addPending ? 'Adding...' : 'Add'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </NutritionCard>
    </Swipeable>
  );
}

function SavedMealSlotPicker({
  meal,
  pending,
  onClose,
  onSelectSlot,
}: {
  meal: SavedMeal;
  pending: boolean;
  onClose: () => void;
  onSelectSlot: (slot: MealSlot) => void;
}) {
  const theme = useAppTheme();

  return (
    <NutritionCard style={styles.savedMealSlotPickerCard}>
      <View style={styles.savedMealSlotPickerHeader}>
        <View style={styles.savedMealSlotPickerCopy}>
          <AppText variant="section">Add meal to</AppText>
          <AppText muted variant="small" numberOfLines={1}>
            {meal.name}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} disabled={pending}>
          <AppText weight="800" style={{ color: theme.colors.primary, opacity: pending ? 0.5 : 1 }}>
            Close
          </AppText>
        </Pressable>
      </View>

      <View style={styles.savedMealSlotPickerOptions}>
        {MEAL_SECTIONS.map((section) => {
          const SlotIcon = section.icon;
          return (
            <Pressable
              key={section.slot}
              accessibilityRole="button"
              disabled={pending}
              onPress={() => onSelectSlot(section.slot)}
              style={({ pressed }) => [
                styles.savedMealSlotPickerOption,
                {
                  backgroundColor: pending ? 'rgba(31,39,48,0.28)' : section.tint,
                  borderColor: pending ? 'transparent' : `${section.color}55`,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <SlotIcon size={16} color={section.color} strokeWidth={2.4} />
              <AppText weight="800" style={{ color: pending ? theme.colors.muted : section.color }}>
                {section.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </NutritionCard>
  );
}

export function NutritionDiaryScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey());
  const yesterdayDate = shiftLocalDate(selectedDate, -1);

  const [tab, setTab] = useState<NutritionTab>('diary');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('All');
  const [manualRecentSearches, setManualRecentSearches] = useState<string[]>([]);
  const [nutritionDetailsExpanded, setNutritionDetailsExpanded] = useState(false);
  const [activeDiaryMeal, setActiveDiaryMeal] = useState<DiaryMealFilter>('all');
  const [savedMealPickerSlot, setSavedMealPickerSlot] = useState<MealSlot | null>(null);
  const [savedMealToLog, setSavedMealToLog] = useState<SavedMeal | null>(null);
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

  useFocusEffect(
    useCallback(() => {
      const currentDayKey = toLocalDateKey();
      setSelectedDate((current) => (current === currentDayKey ? current : currentDayKey));
      return undefined;
    }, []),
  );

  const diary = useDiary(selectedDate);
  const yesterdayDiary = useDiary(yesterdayDate);
  const profile = useProfileBundle();
  const mealsPerDayTarget = useMealsPerDayTarget();
  const nutritionLibrary = useNutritionLibrary();
  const recentFoods = useRecentFoods('food');
  const searchedFoods = useFoodSearch(searchQuery, 'food', { enabled: searchQuery.trim().length > 0 });
  const foodCatalog = useFoodSearch('', 'all');
  const frequentlyLoggedFoods = useFrequentlyLoggedFoods('food');
  const calorieStreak = useCalorieStreak(selectedDate);

  const flashSavedMealAdded = (savedMealId: string) => {
    setRecentlyAddedSavedMealId(savedMealId);
    setTimeout(() => {
      setRecentlyAddedSavedMealId((current) => (current === savedMealId ? null : current));
    }, 820);
  };

  const invalidateFoodCaches = () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey)
        && (query.queryKey[0] === 'foodSearch' || query.queryKey[0] === 'recentFoods' || query.queryKey[0] === 'frequentlyLoggedFoods'),
    });

  const quickAdd = useMutation({
    mutationFn: (input: { foodItemId: string; mealSlot: MealSlot; servings?: number; food?: FoodItem }) =>
      addDiaryEntry({
        localDate: selectedDate,
        mealSlot: input.mealSlot,
        foodItemId: input.foodItemId,
        food: input.food,
        servings: input.servings ?? 1,
      }),
    onSuccess: (_entryId, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.caffeineToday(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateFoodCaches();
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
          localDate: selectedDate,
          mealSlot: input.mealSlot,
          foodItemId: entry.foodItemId,
          servings: entry.servings,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.caffeineToday(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateFoodCaches();
    },
    onError: (error) => Alert.alert('Repeat previous meal', error instanceof Error ? error.message : 'Unable to repeat meal.'),
  });

  const deleteDiaryEntryMutation = useMutation({
    mutationFn: (input: { entryId: string }) => deleteDiaryEntry(input.entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.caffeineToday(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateFoodCaches();
      void Haptics.selectionAsync();
    },
    onError: (error) => Alert.alert('Delete food', error instanceof Error ? error.message : 'Unable to delete food entry.'),
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
    mutationFn: (input: { savedMealId: string; mealSlot: MealSlot }) => logSavedMeal(input.savedMealId, input.mealSlot, selectedDate),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.caffeineToday(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(selectedDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateFoodCaches();
      flashSavedMealAdded(input.savedMealId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => Alert.alert('Meal quick add', error instanceof Error ? error.message : 'Unable to quick add meal.'),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(selectedDate) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => Alert.alert('Goals', error instanceof Error ? error.message : 'Unable to save goal settings.'),
  });

  const quickLogWaterMutation = useMutation({
    mutationFn: (amountMl: number) => addWater(amountMl, selectedDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(selectedDate) });
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

  const visibleMealSections = activeDiaryMeal === 'all' ? mealSections : mealSections.filter((section) => section.slot === activeDiaryMeal);

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
  const recentMealsPreview = recentList.slice(0, 3);
  const globalDefaultMealSlot = useMemo(() => resolveLastUsedMealSlot(diaryData?.day.entries ?? [], 'lunch'), [diaryData?.day.entries]);
  const activeSearchMealSlot = FILTER_TO_SLOT[searchFilter] ?? globalDefaultMealSlot;

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

  const selectDiaryMeal = (slot: DiaryMealFilter) => {
    setActiveDiaryMeal(slot);
    if (slot === 'all') return;
    setExpandedMealSlots((current) => {
      const next = new Set(current);
      next.add(slot);
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

  const confirmDeleteMealEntry = (entry: DiaryEntry) => {
    Alert.alert('Delete food', `Remove "${entry.foodNameSnapshot}" from this meal?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          deleteDiaryEntryMutation.mutate({ entryId: entry.id });
        },
      },
    ]);
  };

  const quickAddSearchFood = (food: FoodItem) => {
    rememberSearch(food.name);
    void Haptics.selectionAsync();
    navigation.navigate('FoodEntryDetails', { food, mealSlot: activeSearchMealSlot, localDate: selectedDate });
  };

  const openSearchFoodDetails = (food: FoodItem) => {
    rememberSearch(food.name);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('FoodEntryDetails', { food, mealSlot: activeSearchMealSlot, localDate: selectedDate });
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
    navigation.navigate('FoodSearch', { mealSlot: globalDefaultMealSlot, localDate: selectedDate, mode: 'food' });
  };

  const logWaterFromGoals = () => {
    if (quickLogWaterMutation.isPending) return;
    quickLogWaterMutation.mutate(250);
  };

  const openSavedMealDetails = (meal: SavedMeal) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CreateMeal', { savedMealId: meal.id });
  };

  const openSavedMealSlotPicker = (meal: SavedMeal) => {
    if (quickAddSavedMealMutation.isPending) {
      return;
    }
    void Haptics.selectionAsync();
    setSavedMealToLog(meal);
  };

  const addSavedMealToDiarySlot = (meal: SavedMeal, mealSlot: MealSlot) => {
    if (quickAddSavedMealMutation.isPending) {
      return;
    }
    void Haptics.selectionAsync();
    quickAddSavedMealMutation.mutate({
      savedMealId: meal.id,
      mealSlot,
    });
    setSavedMealPickerSlot(null);
    setSavedMealToLog(null);
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
  const deletingDiaryEntryId = deleteDiaryEntryMutation.isPending ? deleteDiaryEntryMutation.variables?.entryId : undefined;
  const duplicatingMealId = duplicateSavedMealMutation.isPending ? duplicateSavedMealMutation.variables?.savedMeal.id : undefined;
  const deletingMealId = deleteSavedMealMutation.isPending ? deleteSavedMealMutation.variables?.savedMealId : undefined;

  const onHeaderAction = () => {
    if (tab === 'meals') {
      navigation.navigate('CreateMeal');
      return;
    }
    if (tab === 'goals') {
      saveGoalSettings();
      return;
    }
    navigation.navigate('FoodSearch', { mealSlot: globalDefaultMealSlot, localDate: selectedDate, mode: 'food' });
  };

  const headerAction = tab === 'goals'
    ? { label: saveGoalSettingsMutation.isPending ? 'Saving...' : 'Save goals', icon: Target }
    : tab === 'meals'
      ? { label: 'Create meal', icon: Plus }
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
      <CompactNutritionSummary
        calories={calories}
        target={calorieTarget}
        progress={calorieProgress}
        protein={protein}
        carbs={carbs}
        fat={fat}
        detailsExpanded={nutritionDetailsExpanded}
        onToggleDetails={() => setNutritionDetailsExpanded((current) => !current)}
      />

      <MealNavRow active={activeDiaryMeal} sections={mealSections} onSelect={selectDiaryMeal} />

      {savedMealPickerSlot ? (
        <SavedMealPicker
          mealSlot={savedMealPickerSlot}
          savedMeals={meals}
          foodsById={foodsById}
          pendingMealId={quickAddingMealId}
          onClose={() => setSavedMealPickerSlot(null)}
          onSelect={(meal) => {
            if (savedMealPickerSlot) {
              addSavedMealToDiarySlot(meal, savedMealPickerSlot);
            }
          }}
        />
      ) : null}

      {nutritionDetailsExpanded ? (
        <DailyNutritionDetails
          calories={calories}
          target={calorieTarget}
          remaining={remainingCalories}
          progress={calorieProgress}
          protein={protein}
          carbs={carbs}
          fat={fat}
          goals={goals}
          waterMl={diaryData.day.waterMl}
          streak={calorieStreak.data ?? 0}
          streakLoading={calorieStreak.isLoading}
        />
      ) : null}

      <View style={styles.mealCardsStack}>
        {visibleMealSections.map((section) => (
          <MealSummaryCard
            key={section.slot}
            label={section.label}
            calories={section.calories}
            count={section.count}
            calorieTarget={calorieTarget}
            entries={section.entries}
            previousEntries={section.previousEntries}
            foodsById={foodsById}
            expanded={expandedMealSlots.has(section.slot)}
            icon={section.icon}
            color={section.color}
            tint={section.tint}
            onToggle={() => toggleMealSlot(section.slot)}
            onAddFood={() => navigation.navigate('FoodSearch', { mealSlot: section.slot, localDate: selectedDate, mode: 'food' })}
            onAddDrink={() => navigation.navigate('FoodSearch', { mealSlot: section.slot, localDate: selectedDate, mode: 'drink' })}
            onAddSavedMeal={() => setSavedMealPickerSlot(section.slot)}
            onSaveMeal={() => navigation.navigate('CreateMeal', { localDate: selectedDate, mealSlot: section.slot })}
            onQuickAddLastFood={() => quickAddLastMealFood(section.slot, section.entries, section.previousEntries)}
            onRepeatPreviousMeal={() => repeatMealFromYesterday(section.slot, section.previousEntries)}
            onDeleteEntry={confirmDeleteMealEntry}
            deletingEntryId={deletingDiaryEntryId}
          />
        ))}
      </View>
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
          onPress={() => navigation.navigate('BarcodeScanner', { mealSlot: activeSearchMealSlot, localDate: selectedDate, mode: 'food' })}
          style={({ pressed }) => [
            styles.searchAction,
            { opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <Barcode size={20} color={theme.colors.primary} />
        </Pressable>
      </View>

      <NutritionButton
        label="Create food manually"
        icon={Plus}
        variant="soft"
        onPress={() => navigation.navigate('CustomFood', { mealSlot: activeSearchMealSlot, localDate: selectedDate, mode: 'food' })}
      />

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
        filteredSearchResults.map((food) => {
          const basisCalories = Number.isFinite(food.caloriesPer100) ? Math.round(food.caloriesPer100 ?? 0) : Math.round(food.calories);
          const fixedAmountLabel =
            Number.isFinite(food.servingSize) && food.servingSize > 0
              ? `${Math.round(food.servingSize)} ${food.servingUnit || food.baseUnit || (food.itemType === 'drink' ? 'ml' : 'g')}`
              : food.packageSize && food.packageUnit
                ? `${Math.round(food.packageSize)} ${food.packageUnit}`
                : null;
          return (
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
                  {food.brandName ? `${food.brandName} • ` : ''}
                  {food.servingMode === 'fixed_package'
                    ? `${food.servingLabel ?? '1 enhet'}${fixedAmountLabel ? ` • ${fixedAmountLabel}` : ''}`
                    : food.servingMode === 'suggested_amount'
                      ? `${Math.round(food.servingSize)} ${food.baseUnit ?? (food.itemType === 'drink' ? 'ml' : 'g')}${food.servingLabel ? ` • ${food.servingLabel}` : ''}`
                      : `${food.nutritionBasis === 'per_100ml' ? 'per 100 ml' : 'per 100 g'} basis`}
                </AppText>
                <AppText muted variant="small" style={styles.foodMeta}>
                  {basisCalories} kcal • {food.nutritionBasis === 'per_100ml' ? 'per 100 ml' : 'per 100 g'}
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
          );
        })
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

      <NutritionButton
        label="Create meal"
        icon={Plus}
        variant="soft"
        onPress={() => navigation.navigate('CreateMeal')}
        style={styles.createMealButton}
      />

      {savedMealToLog ? (
        <SavedMealSlotPicker
          meal={savedMealToLog}
          pending={quickAddSavedMealMutation.isPending}
          onClose={() => setSavedMealToLog(null)}
          onSelectSlot={(slot) => addSavedMealToDiarySlot(savedMealToLog, slot)}
        />
      ) : null}

      {mealCards.length ? (
        mealCards.map(({ meal, icon: Icon, totals, ingredients }) => (
          <SavedMealCard
            key={meal.id}
            meal={meal}
            icon={Icon}
            totals={totals}
            ingredients={ingredients}
            recentlyAdded={recentlyAddedSavedMealId === meal.id}
            addPending={quickAddingMealId === meal.id}
            duplicatePending={duplicatingMealId === meal.id}
            deletePending={deletingMealId === meal.id}
            onOpen={() => openSavedMealDetails(meal)}
            onAddToMeal={() => openSavedMealSlotPicker(meal)}
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
      {tab === 'diary' ? <DateNavigator localDate={selectedDate} onChange={setSelectedDate} hint /> : null}

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
    gap: 12,
  },
  compactSummaryCard: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compactSummaryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  compactCaloriesBlock: {
    flex: 1,
    minWidth: 0,
  },
  compactSummaryLabel: {
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  compactCaloriesRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 5,
  },
  compactCaloriesValue: {
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 32,
  },
  compactCaloriesUnit: {
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 2,
  },
  compactDetailsButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  compactSummaryTrack: {
    backgroundColor: 'rgba(31,39,48,0.78)',
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  compactSummaryFill: {
    borderRadius: 999,
    height: '100%',
  },
  compactMacroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  compactMacroStat: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.38)',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  compactMacroDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  mealNavRow: {
    flexDirection: 'row',
    gap: 6,
  },
  mealNavChip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 6,
  },
  dailyDetailsCard: {
    gap: 12,
    padding: 14,
  },
  dailyDetailsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailsProgressBlock: {
    gap: 6,
  },
  detailsProgressLabels: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailProgressTrack: {
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
  },
  detailProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  detailMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailMetric: {
    backgroundColor: 'rgba(31,39,48,0.38)',
    borderRadius: 8,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 3,
    minHeight: 58,
    padding: 9,
  },
  detailMetricDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  streakInline: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  savedMealPickerCard: {
    gap: 10,
    padding: 14,
  },
  savedMealPickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  savedMealPickerRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.38)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 10,
  },
  savedMealPickerCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  savedMealPickerEmpty: {
    backgroundColor: 'rgba(31,39,48,0.28)',
    borderRadius: 10,
    padding: 12,
  },
  mealCardsStack: {
    gap: 12,
  },
  mealSummaryCard: {
    borderRadius: 12,
    gap: 10,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  mealSummaryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  mealSummaryToggle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  mealSummaryIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
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
  mealSummaryAddButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,18,0.22)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 9,
  },
  mealLastFood: {
    marginTop: 2,
  },
  mealProgressTrack: {
    borderRadius: 999,
    height: 5,
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
  mealFoodTrail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mealFoodDeleteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(242,95,92,0.12)',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
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
  createMealButton: {
    minHeight: 50,
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
  savedMealMainTouch: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
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
    minWidth: 92,
  },
  savedMealAddButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    minWidth: 70,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  savedMealSlotPickerCard: {
    gap: 10,
    padding: 14,
  },
  savedMealSlotPickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  savedMealSlotPickerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  savedMealSlotPickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedMealSlotPickerOption: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
