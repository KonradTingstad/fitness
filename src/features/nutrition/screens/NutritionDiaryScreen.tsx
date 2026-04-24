import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Barcode,
  ChevronRight,
  Clock,
  Droplets,
  LucideProps,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Soup,
  Star,
  Target,
  Utensils,
  Wheat,
} from 'lucide-react-native';
import { ComponentType, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { addDiaryEntry } from '@/data/repositories/nutritionRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { DiaryEntry, FoodItem, GoalSettings, MealSlot, SavedMeal } from '@/domain/models';
import { useDiary, useFoodSearch, useNutritionLibrary, useProfileBundle, useRecentFoods } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NutritionTab = 'diary' | 'search' | 'meals' | 'goals';
type SearchFilter = 'All' | 'Recent' | 'Favorites' | 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';

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

function strategyCopy(goal: GoalSettings['goal']): string {
  if (goal === 'lose') return 'Calorie deficit with high protein to preserve lean mass.';
  if (goal === 'gain') return 'Lean-bulk setup focused on performance and recovery.';
  if (goal === 'maintain') return 'Balanced maintenance with steady energy and macro intake.';
  return 'Custom nutrition strategy adapted to your daily targets.';
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

function CalorieProgressArc({ progress }: { progress: number }) {
  const theme = useAppTheme();
  const size = 104;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const arcCoverage = 0.78;
  const arcLength = circumference * arcCoverage;
  const normalized = Math.max(0, Math.min(1, progress));
  const percent = progressPercent(normalized);

  return (
    <View style={styles.calorieArcWrap}>
      <Svg width={size} height={size}>
        <G rotation={130} origin={`${center},${center}`}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={theme.colors.surfaceAlt}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={theme.colors.primary}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={arcLength * (1 - normalized)}
            strokeLinecap="round"
            strokeOpacity={0.26}
            strokeWidth={strokeWidth + 4}
          />
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={theme.colors.primary}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={arcLength * (1 - normalized)}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        </G>
      </Svg>
      <View style={styles.calorieArcCenter}>
        <AppText weight="800" style={{ color: theme.colors.primary }}>
          {percent}%
        </AppText>
      </View>
    </View>
  );
}

function MacroProgressItem({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const theme = useAppTheme();
  const progress = clampedProgress(value, goal);

  return (
    <View style={styles.macroDashboardItem}>
      <View style={styles.macroDashboardHeader}>
        <AppText weight="800" variant="small">
          {label}
        </AppText>
        <AppText weight="800" style={{ color }}>
          {value}g
        </AppText>
      </View>
      <AppText muted variant="small">
        of {goal}g
      </AppText>
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
}: {
  calories: number;
  target: number;
  remaining: number;
  progress: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: GoalSettings;
}) {
  const theme = useAppTheme();

  return (
    <Card style={styles.caloriesDashboardCard}>
      <View style={styles.caloriesDashboardTop}>
        <View style={styles.calorieMetricBlock}>
          <AppText variant="section">Calories</AppText>
          <AppText style={[styles.calorieDashboardMetric, { color: theme.colors.primary }]}>{calories}</AppText>
          <AppText muted style={styles.calorieGoalText}>
            of {target} kcal
          </AppText>
          <AppText weight="700" style={[styles.calorieLeftText, { color: remaining >= 0 ? theme.colors.primary : theme.colors.warning }]}>
            {remainingCalorieLabel(remaining)}
          </AppText>
        </View>
        <CalorieProgressArc progress={progress} />
      </View>

      <View style={styles.macroDashboardRow}>
        <MacroProgressItem label="Protein" value={protein} goal={goals.proteinTargetG} color={theme.colors.primary} />
        <MacroProgressItem label="Carbs" value={carbs} goal={goals.carbTargetG} color={theme.colors.info} />
        <MacroProgressItem label="Fat" value={fat} goal={goals.fatTargetG} color={theme.colors.warning} />
      </View>
    </Card>
  );
}

function MealSummaryCard({
  label,
  calories,
  count,
  calorieTarget,
  icon: Icon,
  color,
  tint,
  onPress,
}: {
  label: string;
  calories: number;
  count: number;
  calorieTarget: number;
  icon: ComponentType<LucideProps>;
  color: string;
  tint: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const progress = clampedProgress(calories, calorieTarget);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealSummaryCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[styles.mealSummaryIcon, { backgroundColor: tint, borderColor: color }]}>
        <Icon size={22} color={color} strokeWidth={2.4} />
      </View>
      <View style={styles.mealSummaryCopy}>
        <AppText weight="800" style={styles.mealSummaryTitle}>
          {label}
        </AppText>
        <AppText muted>
          {calories} kcal • {mealItemLabel(count)}
        </AppText>
      </View>
      <View style={styles.mealProgressWrap}>
        <AppText weight="800" style={{ color: progress > 0 ? theme.colors.primary : theme.colors.muted }}>
          {progressPercent(progress)}%
        </AppText>
        <View style={[styles.mealProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
          <View style={[styles.mealProgressFill, { backgroundColor: theme.colors.primary, width: `${progress * 100}%` }]} />
        </View>
      </View>
      <ChevronRight size={20} color={theme.colors.muted} />
    </Pressable>
  );
}

export function NutritionDiaryScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const localDate = toLocalDateKey();

  const [tab, setTab] = useState<NutritionTab>('diary');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('All');
  const [manualRecentSearches, setManualRecentSearches] = useState<string[]>([]);

  const diary = useDiary(localDate);
  const profile = useProfileBundle();
  const nutritionLibrary = useNutritionLibrary();
  const recentFoods = useRecentFoods();
  const searchedFoods = useFoodSearch(searchQuery);
  const foodCatalog = useFoodSearch('');

  const quickAdd = useMutation({
    mutationFn: (input: { foodItemId: string; mealSlot: MealSlot }) =>
      addDiaryEntry({
        localDate,
        mealSlot: input.mealSlot,
        foodItemId: input.foodItemId,
        servings: 1,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
    },
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
        const kcal = entries.reduce((sum, entry) => sum + entryCalories(entry), 0);
        return {
          ...section,
          calories: roundMetric(kcal),
          count: entries.length,
        };
      }),
    [diaryData?.byMeal],
  );

  const calorieTarget = goals?.calorieTarget ?? 0;
  const calories = roundMetric(diaryData?.totals.calories ?? 0);
  const remainingCalories = roundMetric(calorieTarget - calories);
  const calorieProgress = calorieTarget <= 0 ? 0 : Math.max(0, Math.min(1, calories / calorieTarget));
  const protein = roundMetric(diaryData?.totals.proteinG ?? 0);
  const carbs = roundMetric(diaryData?.totals.carbsG ?? 0);
  const fat = roundMetric(diaryData?.totals.fatG ?? 0);

  const loggedMealsToday = useMemo(() => {
    const slots = new Set((diaryData?.day.entries ?? []).map((entry) => entry.mealSlot));
    return slots.size;
  }, [diaryData?.day.entries]);

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
      })),
    [meals, foodsById],
  );

  const favoriteMeals = mealCards.filter((item) => item.meal.isFavorite);
  const activeSearchMealSlot = FILTER_TO_SLOT[searchFilter] ?? 'lunch';

  const rememberSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.length) return;
    setManualRecentSearches((current) => [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8));
  };

  const onHeaderAction = () => {
    if (tab === 'meals') {
      Alert.alert('Meals', 'Custom meal builder can be opened from this action.');
      return;
    }
    if (tab === 'goals') {
      Alert.alert('Goals', 'Goals editor can be opened from this action.');
      return;
    }
    navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate });
  };

  const headerAction = tab === 'goals'
    ? { label: 'Edit goals', icon: Pencil }
    : tab === 'meals'
      ? { label: 'Add custom meal', icon: Plus }
      : { label: 'Add food', icon: Plus };

  if (diary.isLoading || profile.isLoading || nutritionLibrary.isLoading || recentFoods.isLoading) {
    return <LoadingState label="Loading nutrition" />;
  }

  if (!diaryData || !goals) {
    return <EmptyState icon={Target} title="Nutrition data unavailable" body="Try reloading once profile and diary data are ready." />;
  }

  const renderTabs = () => (
    <View style={[styles.tabShell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {NUTRITION_TABS.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={({ pressed }) => [
              styles.tabItem,
              {
                backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
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
      />

      <View style={styles.mealCardsStack}>
        {mealSections.map((section) => (
          <MealSummaryCard
            key={section.slot}
            label={section.label}
            calories={section.calories}
            count={section.count}
            calorieTarget={calorieTarget}
            icon={section.icon}
            color={section.color}
            tint={section.tint}
            onPress={() => navigation.navigate('FoodSearch', { mealSlot: section.slot, localDate })}
          />
        ))}
      </View>

      <Button label="Log meal" icon={Plus} onPress={() => navigation.navigate('FoodSearch', { mealSlot: 'lunch', localDate })} style={styles.primaryCta} />

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('BarcodeScanner', { mealSlot: 'lunch', localDate })}
        style={({ pressed }) => [
          styles.secondaryQuickAction,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
        ]}
      >
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
      </Pressable>
    </View>
  );

  const renderSearchTab = () => (
    <>
      <View style={styles.searchRow}>
        <View style={[styles.searchInputWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
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
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
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
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
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

      <View style={styles.searchResultsHeader}>
        <AppText variant="section">Search results</AppText>
        <SlidersHorizontal size={17} color={theme.colors.muted} />
      </View>

      {searchedFoods.isLoading && searchQuery.trim().length ? (
        <LoadingState label="Searching foods" />
      ) : filteredSearchResults.length ? (
        filteredSearchResults.map((food) => (
          <Card key={food.id} style={styles.foodCard}>
            <View style={styles.foodRow}>
              <View style={[styles.foodThumb, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Utensils size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.foodCopy}>
                <AppText weight="800" style={styles.foodTitle}>
                  {food.name}
                </AppText>
                <AppText muted>
                  {food.calories} kcal • per {food.servingSize} {food.servingUnit}
                </AppText>
                <AppText muted>
                  <AppText style={{ color: theme.colors.primary }} weight="700">
                    P
                  </AppText>{' '}
                  {roundMetric(food.proteinG)} g •{' '}
                  <AppText style={{ color: theme.colors.primary }} weight="700">
                    C
                  </AppText>{' '}
                  {roundMetric(food.carbsG)} g •{' '}
                  <AppText style={{ color: theme.colors.primary }} weight="700">
                    F
                  </AppText>{' '}
                  {roundMetric(food.fatG)} g
                </AppText>
              </View>
              <Pressable
                onPress={() => {
                  rememberSearch(food.name);
                  quickAdd.mutate({ foodItemId: food.id, mealSlot: activeSearchMealSlot });
                }}
                style={({ pressed }) => [
                  styles.quickAddButton,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.84 : 1 },
                ]}
              >
                <Plus size={18} color={theme.colors.primary} />
              </Pressable>
            </View>
          </Card>
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
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.84 : 1 },
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
        mealCards.map(({ meal, icon: Icon, totals }) => (
          <Card key={meal.id} style={styles.savedMealCard}>
            <Pressable
              onPress={() => Alert.alert(meal.name, 'Meal details can open from this card.')}
              style={({ pressed }) => [styles.savedMealRow, { opacity: pressed ? 0.84 : 1 }]}
            >
              <View style={[styles.savedMealThumb, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Icon size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.savedMealCopy}>
                <AppText weight="800" style={styles.savedMealTitle}>
                  {meal.name}
                </AppText>
                <AppText muted>{totals.calories} kcal</AppText>
                <View style={styles.savedMacroRow}>
                  <View style={styles.savedMacroCell}>
                    <AppText weight="800" style={{ color: theme.colors.primary }}>
                      {totals.protein} g
                    </AppText>
                    <AppText muted>Protein</AppText>
                  </View>
                  <View style={[styles.savedMacroDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.savedMacroCell}>
                    <AppText weight="800" style={{ color: theme.colors.primary }}>
                      {totals.carbs} g
                    </AppText>
                    <AppText muted>Carbs</AppText>
                  </View>
                  <View style={[styles.savedMacroDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.savedMacroCell}>
                    <AppText weight="800" style={{ color: theme.colors.primary }}>
                      {totals.fat} g
                    </AppText>
                    <AppText muted>Fat</AppText>
                  </View>
                </View>
              </View>
              <ChevronRight size={20} color={theme.colors.muted} />
            </Pressable>
          </Card>
        ))
      ) : (
        <EmptyState icon={Soup} title="No saved meals yet" body="Create custom meals to speed up daily logging." />
      )}

      <View style={styles.sectionTitleRow}>
        <AppText variant="section">Favorites</AppText>
        <Pressable onPress={() => setTab('search')}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            View all
          </AppText>
        </Pressable>
      </View>

      {favoriteMeals.length ? (
        favoriteMeals.map(({ meal, icon: Icon, totals }) => (
          <Card key={`fav-${meal.id}`} style={styles.favoriteCard}>
            <View style={styles.favoriteRow}>
              <View style={[styles.favoriteThumb, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Icon size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.favoriteCopy}>
                <AppText weight="800">{meal.name}</AppText>
                <AppText muted>
                  {totals.calories} kcal • P {totals.protein} g • C {totals.carbs} g • F {totals.fat} g
                </AppText>
              </View>
              <Star size={20} color={theme.colors.warning} fill={theme.colors.warning} />
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <AppText muted>No favorites yet.</AppText>
        </Card>
      )}
    </>
  );

  const renderGoalsTab = () => {
    const mealsPerDayTarget = 4;
    const waterProgress = goals.waterTargetMl <= 0 ? 0 : Math.max(0, Math.min(1, diaryData.day.waterMl / goals.waterTargetMl));
    const proteinProgress = goals.proteinTargetG <= 0 ? 0 : Math.max(0, Math.min(1, protein / goals.proteinTargetG));
    const carbsProgress = goals.carbTargetG <= 0 ? 0 : Math.max(0, Math.min(1, carbs / goals.carbTargetG));
    const fatProgress = goals.fatTargetG <= 0 ? 0 : Math.max(0, Math.min(1, fat / goals.fatTargetG));
    const calorieStatus =
      calories > goals.calorieTarget * 1.08 ? 'Above target' : calories < goals.calorieTarget * 0.9 ? 'Under target' : 'On track';

    return (
      <>
        <AppText variant="title" style={styles.sectionTitle}>
          Daily targets
        </AppText>

        <Card style={styles.goalMainCard}>
          <View style={styles.goalMainTop}>
            <View style={[styles.goalMainIcon, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
              <Target size={26} color={theme.colors.primary} />
            </View>
            <View style={styles.goalMainCopy}>
              <AppText variant="section">Calories</AppText>
              <View style={styles.goalMainMetricRow}>
                <AppText style={[styles.goalMainMetric, { color: theme.colors.primary }]}>{goals.calorieTarget}</AppText>
                <AppText style={[styles.goalMainUnit, { color: theme.colors.text }]}>kcal</AppText>
              </View>
              <AppText muted>
                Daily target • {goals.goal === 'gain' ? 'Lean bulk' : goals.goal === 'lose' ? 'Fat loss' : 'Maintenance'}
              </AppText>
            </View>
            <View style={styles.goalTargetWrap}>
              <AppText muted>Target</AppText>
              <AppText style={{ color: theme.colors.primary }} weight="800">
                {goals.calorieTarget} kcal
              </AppText>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${calorieProgress * 100}%` }]} />
          </View>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            {calorieStatus}
          </AppText>
        </Card>

        <View style={styles.goalGrid}>
          <Card style={styles.goalMiniCard}>
            <View style={styles.goalMiniHead}>
              <View style={[styles.goalMiniIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Wheat size={16} color={theme.colors.primary} />
              </View>
              <AppText variant="section">Protein</AppText>
            </View>
            <View style={styles.goalUnitRow}>
              <AppText style={[styles.goalMiniMetric, { color: theme.colors.primary }]} weight="800">
                {goals.proteinTargetG}
              </AppText>
              <AppText style={styles.goalMiniUnit}>g</AppText>
            </View>
            <View style={[styles.goalMiniTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={[styles.goalMiniFill, { backgroundColor: theme.colors.primary, width: `${proteinProgress * 100}%` }]} />
            </View>
            <AppText muted>{goals.proteinTargetG} g target</AppText>
          </Card>

          <Card style={styles.goalMiniCard}>
            <View style={styles.goalMiniHead}>
              <View style={[styles.goalMiniIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Soup size={16} color={theme.colors.warning} />
              </View>
              <AppText variant="section">Carbs</AppText>
            </View>
            <View style={styles.goalUnitRow}>
              <AppText style={[styles.goalMiniMetric, { color: theme.colors.primary }]} weight="800">
                {goals.carbTargetG}
              </AppText>
              <AppText style={styles.goalMiniUnit}>g</AppText>
            </View>
            <View style={[styles.goalMiniTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={[styles.goalMiniFill, { backgroundColor: theme.colors.primary, width: `${carbsProgress * 100}%` }]} />
            </View>
            <AppText muted>{goals.carbTargetG} g target</AppText>
          </Card>

          <Card style={styles.goalMiniCard}>
            <View style={styles.goalMiniHead}>
              <View style={[styles.goalMiniIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Droplets size={16} color={theme.colors.warning} />
              </View>
              <AppText variant="section">Fat</AppText>
            </View>
            <View style={styles.goalUnitRow}>
              <AppText style={[styles.goalMiniMetric, { color: theme.colors.primary }]} weight="800">
                {goals.fatTargetG}
              </AppText>
              <AppText style={styles.goalMiniUnit}>g</AppText>
            </View>
            <View style={[styles.goalMiniTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={[styles.goalMiniFill, { backgroundColor: theme.colors.primary, width: `${fatProgress * 100}%` }]} />
            </View>
            <AppText muted>{goals.fatTargetG} g target</AppText>
          </Card>
        </View>

        <View style={styles.goalRow}>
          <Card style={styles.goalWideCard}>
            <View style={styles.goalWideHead}>
              <View style={[styles.goalMiniIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Droplets size={17} color={theme.colors.info} />
              </View>
              <AppText variant="section">Water</AppText>
            </View>
            <View style={styles.goalUnitRow}>
              <AppText style={[styles.goalWideMetric, { color: theme.colors.primary }]} weight="800">
                {goals.waterTargetMl}
              </AppText>
              <AppText style={styles.goalWideUnit}>ml</AppText>
            </View>
            <AppText muted>Daily target</AppText>
            <View style={[styles.goalMiniTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={[styles.goalMiniFill, { backgroundColor: theme.colors.info, width: `${waterProgress * 100}%` }]} />
            </View>
          </Card>

          <Card style={styles.goalWideCard}>
            <View style={styles.goalWideHead}>
              <View style={[styles.goalMiniIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Clock size={17} color={theme.colors.accent} />
              </View>
              <AppText variant="section">Meals per day</AppText>
            </View>
            <AppText style={[styles.goalWideMetric, { color: theme.colors.primary }]}>{mealsPerDayTarget}</AppText>
            <AppText muted>Daily target</AppText>
            <AppText muted>{loggedMealsToday} logged today</AppText>
          </Card>
        </View>

        <Card style={styles.strategyCard}>
          <View style={styles.strategyRow}>
            <View style={[styles.strategyIcon, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
              <Target size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.strategyCopy}>
              <AppText variant="section">Nutrition strategy</AppText>
              <AppText muted>{strategyCopy(goals.goal)}</AppText>
            </View>
            <ChevronRight size={20} color={theme.colors.muted} />
          </View>
        </Card>

        <Button label="Update goals" icon={Target} onPress={() => Alert.alert('Goals', 'Goal update flow can be opened from this button.')} style={styles.primaryCta} />
      </>
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Nutrition</AppText>
          <AppText muted>Log food, meals, and goals.</AppText>
        </View>
        <Button label={headerAction.label} icon={headerAction.icon} variant="secondary" onPress={onHeaderAction} style={styles.headerAction} />
      </View>

      {renderTabs()}

      {tab === 'diary' ? renderDiaryTab() : null}
      {tab === 'search' ? renderSearchTab() : null}
      {tab === 'meals' ? renderMealsTab() : null}
      {tab === 'goals' ? renderGoalsTab() : null}
    </Screen>
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
    paddingHorizontal: 14,
  },
  tabShell: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
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
    gap: 14,
  },
  caloriesDashboardCard: {
    gap: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  caloriesDashboardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  calorieMetricBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  calorieDashboardMetric: {
    fontSize: 46,
    fontWeight: '800',
    lineHeight: 50,
  },
  calorieGoalText: {
    fontSize: 14,
    lineHeight: 18,
  },
  calorieLeftText: {
    marginTop: 8,
  },
  calorieArcWrap: {
    alignItems: 'center',
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  calorieArcCenter: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  macroDashboardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroDashboardItem: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  macroDashboardHeader: {
    gap: 2,
  },
  thinProgressTrack: {
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
  },
  thinProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  mealCardsStack: {
    gap: 14,
    marginTop: 8,
  },
  mealSummaryCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  mealSummaryIcon: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  mealSummaryCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  mealSummaryTitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  mealProgressWrap: {
    alignItems: 'flex-end',
    gap: 7,
    width: 70,
  },
  mealProgressTrack: {
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
    width: 62,
  },
  mealProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  progressTrack: {
    borderRadius: 8,
    height: 14,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 8,
    height: '100%',
  },
  primaryCta: {
    minHeight: 56,
  },
  secondaryQuickAction: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: 1,
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
  },
  foodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  foodThumb: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  foodCopy: {
    flex: 1,
    gap: 2,
  },
  foodTitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  quickAddButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
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
  savedMealRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  savedMealThumb: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  savedMealCopy: {
    flex: 1,
    gap: 4,
  },
  savedMealTitle: {
    fontSize: 16,
    lineHeight: 20,
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  favoriteThumb: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  favoriteCopy: {
    flex: 1,
    gap: 1,
  },
  goalMainCard: {
    gap: 8,
  },
  goalMainTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  goalMainIcon: {
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  goalMainCopy: {
    flex: 1,
    gap: 1,
  },
  goalMainMetricRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
  },
  goalMainMetric: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  goalMainUnit: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 4,
  },
  goalTargetWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  goalGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  goalMiniCard: {
    flex: 1,
    gap: 8,
  },
  goalMiniHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  goalMiniIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  goalMiniMetric: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  goalUnitRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  goalMiniUnit: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 3,
  },
  goalMiniTrack: {
    borderRadius: 6,
    height: 9,
    overflow: 'hidden',
  },
  goalMiniFill: {
    borderRadius: 6,
    height: '100%',
  },
  goalRow: {
    flexDirection: 'row',
    gap: 8,
  },
  goalWideCard: {
    flex: 1,
    gap: 7,
  },
  goalWideHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  goalWideMetric: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  goalWideUnit: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 3,
  },
  strategyCard: {
    gap: 0,
  },
  strategyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  strategyIcon: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  strategyCopy: {
    flex: 1,
    gap: 2,
  },
});
