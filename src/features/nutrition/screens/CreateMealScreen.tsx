import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, Minus, Pencil, Plus, Search, Trash2, Utensils } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { createSavedMeal, deleteSavedMeal, SavedMealItemInput, updateSavedMeal } from '@/data/repositories/nutritionRepository';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { DiaryEntry, FoodItem, MealSlot, SavedMealItem } from '@/domain/models';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { NutritionButton } from '@/features/nutrition/components/NutritionChrome';
import { useDiary, useFoodSearch, useNutritionLibrary, useRecentFoods } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'CreateMeal'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type QuantityType = 'portion' | 'gram';

type DraftTotals = {
  servings: number;
  totalGrams: number;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
};

type DraftMealItem = {
  draftId: string;
  foodItemId: string;
  mealSlot?: MealSlot | null;
  food?: FoodItem;
  foodName: string;
  brandName?: string | null;
  servingSize: number;
  servingUnit: string;
  gramsPerServing: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantityType: QuantityType;
  amountText: string;
  sourceQuantityType?: QuantityType;
  sourceAmountText?: string;
  sourceServings?: number;
  sourceTotals?: DraftTotals;
};

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatAmount(value: number): string {
  const rounded = roundTo(value, 2);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
}

function positiveOrFallback(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

function draftItemFromFood(food: FoodItem): DraftMealItem {
  return {
    draftId: `${food.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    foodItemId: food.id,
    mealSlot: null,
    food,
    foodName: food.name,
    brandName: food.brandName,
    servingSize: positiveOrFallback(food.servingSize, 100),
    servingUnit: food.servingUnit?.trim() || 'g',
    gramsPerServing: positiveOrFallback(food.gramsPerServing, 100),
    calories: Math.max(0, food.calories),
    proteinG: Math.max(0, food.proteinG),
    carbsG: Math.max(0, food.carbsG),
    fatG: Math.max(0, food.fatG),
    quantityType: 'portion',
    amountText: '1',
  };
}

function draftItemFromDiaryEntry(entry: DiaryEntry, food?: FoodItem): DraftMealItem {
  const quantityType = entry.quantityType ?? 'portion';
  const gramsPerServing = positiveOrFallback(food?.gramsPerServing, positiveOrFallback(entry.totalGrams, entry.servings * 100) / entry.servings);
  const amountText = quantityType === 'gram' && entry.totalGrams ? formatAmount(entry.totalGrams) : formatAmount(entry.servings);
  const sourceTotals: DraftTotals = {
    servings: entry.servings,
    totalGrams: entry.totalGrams ?? entry.servings * gramsPerServing,
    totalCalories: entry.totalCalories ?? entry.caloriesSnapshot * entry.servings,
    totalProteinG: entry.totalProteinG ?? entry.proteinGSnapshot * entry.servings,
    totalCarbsG: entry.totalCarbsG ?? entry.carbsGSnapshot * entry.servings,
    totalFatG: entry.totalFatG ?? entry.fatGSnapshot * entry.servings,
  };

  return {
    draftId: `${entry.id}:${Date.now()}`,
    foodItemId: entry.foodItemId,
    mealSlot: entry.mealSlot,
    food,
    foodName: food?.name ?? entry.foodNameSnapshot,
    brandName: food?.brandName,
    servingSize: positiveOrFallback(food?.servingSize, gramsPerServing),
    servingUnit: food?.servingUnit?.trim() || 'g',
    gramsPerServing,
    calories: Math.max(0, food?.calories ?? entry.caloriesSnapshot),
    proteinG: Math.max(0, food?.proteinG ?? entry.proteinGSnapshot),
    carbsG: Math.max(0, food?.carbsG ?? entry.carbsGSnapshot),
    fatG: Math.max(0, food?.fatG ?? entry.fatGSnapshot),
    quantityType,
    amountText,
    sourceQuantityType: quantityType,
    sourceAmountText: amountText,
    sourceServings: entry.servings,
    sourceTotals,
  };
}

function draftItemFromSavedMealItem(item: SavedMealItem, food?: FoodItem): DraftMealItem {
  const quantityType = item.quantityType ?? 'portion';
  const fallbackGramsPerServing = item.totalGrams && item.servings > 0 ? item.totalGrams / item.servings : 100;
  const gramsPerServing = positiveOrFallback(food?.gramsPerServing, fallbackGramsPerServing);
  const amountText = quantityType === 'gram' && item.totalGrams ? formatAmount(item.totalGrams) : formatAmount(item.servings);
  const fallbackCalories = item.totalCalories != null && item.servings > 0 ? item.totalCalories / item.servings : 0;
  const fallbackProtein = item.totalProteinG != null && item.servings > 0 ? item.totalProteinG / item.servings : 0;
  const fallbackCarbs = item.totalCarbsG != null && item.servings > 0 ? item.totalCarbsG / item.servings : 0;
  const fallbackFat = item.totalFatG != null && item.servings > 0 ? item.totalFatG / item.servings : 0;

  return {
    draftId: `${item.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    foodItemId: item.foodItemId,
    mealSlot: item.mealSlot ?? null,
    food,
    foodName: food?.name ?? 'Food item',
    brandName: food?.brandName,
    servingSize: positiveOrFallback(food?.servingSize, gramsPerServing),
    servingUnit: food?.servingUnit?.trim() || 'g',
    gramsPerServing,
    calories: Math.max(0, food?.calories ?? fallbackCalories),
    proteinG: Math.max(0, food?.proteinG ?? fallbackProtein),
    carbsG: Math.max(0, food?.carbsG ?? fallbackCarbs),
    fatG: Math.max(0, food?.fatG ?? fallbackFat),
    quantityType,
    amountText,
    sourceQuantityType: quantityType,
    sourceAmountText: amountText,
    sourceServings: item.servings,
    sourceTotals: {
      servings: item.servings,
      totalGrams: item.totalGrams ?? item.servings * gramsPerServing,
      totalCalories: item.totalCalories ?? Math.round(fallbackCalories * item.servings),
      totalProteinG: item.totalProteinG ?? roundTo(fallbackProtein * item.servings),
      totalCarbsG: item.totalCarbsG ?? roundTo(fallbackCarbs * item.servings),
      totalFatG: item.totalFatG ?? roundTo(fallbackFat * item.servings),
    },
  };
}

function calculateDraftItemTotals(item: DraftMealItem): DraftTotals | null {
  const amount = parsePositiveNumber(item.amountText);
  if (!amount) return null;

  if (
    item.sourceTotals &&
    item.sourceQuantityType === item.quantityType &&
    item.sourceAmountText === item.amountText &&
    item.sourceServings
  ) {
    return item.sourceTotals;
  }

  const servings = item.quantityType === 'gram' ? amount / item.gramsPerServing : amount;
  if (!Number.isFinite(servings) || servings <= 0) return null;

  return {
    servings,
    totalGrams: servings * item.gramsPerServing,
    totalCalories: Math.round(item.calories * servings),
    totalProteinG: roundTo(item.proteinG * servings),
    totalCarbsG: roundTo(item.carbsG * servings),
    totalFatG: roundTo(item.fatG * servings),
  };
}

function mealTotals(items: DraftMealItem[]): DraftTotals {
  return items.reduce<DraftTotals>(
    (totals, item) => {
      const itemTotals = calculateDraftItemTotals(item);
      if (!itemTotals) return totals;
      totals.servings += itemTotals.servings;
      totals.totalGrams += itemTotals.totalGrams;
      totals.totalCalories += itemTotals.totalCalories;
      totals.totalProteinG += itemTotals.totalProteinG;
      totals.totalCarbsG += itemTotals.totalCarbsG;
      totals.totalFatG += itemTotals.totalFatG;
      return totals;
    },
    { servings: 0, totalGrams: 0, totalCalories: 0, totalProteinG: 0, totalCarbsG: 0, totalFatG: 0 },
  );
}

export function CreateMealScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const editingSavedMealId = route.params?.savedMealId;
  const isEditMode = Boolean(editingSavedMealId);
  const sourceDate = route.params?.localDate;
  const sourceMealSlot = route.params?.mealSlot;
  const [mealName, setMealName] = useState(sourceMealSlot ? `${MEAL_SLOT_LABELS[sourceMealSlot]} meal` : '');
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [draftItems, setDraftItems] = useState<DraftMealItem[]>([]);
  const hydratedFromDiary = useRef(false);
  const hydratedFromSavedMeal = useRef(false);

  const diary = useDiary(sourceDate ?? toLocalDateKey());
  const nutritionLibrary = useNutritionLibrary();
  const foodCatalog = useFoodSearch('', 'all');
  const searchedFoods = useFoodSearch(query, 'food', { enabled: query.trim().length > 0 });
  const recentFoods = useRecentFoods('food');

  const foodsById = useMemo(() => {
    const index = new Map<string, FoodItem>();
    for (const food of foodCatalog.data ?? []) index.set(food.id, food);
    for (const food of recentFoods.data ?? []) index.set(food.id, food);
    for (const food of searchedFoods.data ?? []) index.set(food.id, food);
    return index;
  }, [foodCatalog.data, recentFoods.data, searchedFoods.data]);

  const editingMeal = useMemo(
    () => (editingSavedMealId ? (nutritionLibrary.data?.savedMeals ?? []).find((meal) => meal.id === editingSavedMealId) : null),
    [editingSavedMealId, nutritionLibrary.data?.savedMeals],
  );

  useEffect(() => {
    if (isEditMode || !sourceDate || !sourceMealSlot || hydratedFromDiary.current || diary.isLoading) {
      return;
    }

    const entries = diary.data?.byMeal[sourceMealSlot] ?? [];
    if (entries.length) {
      setDraftItems(entries.map((entry) => draftItemFromDiaryEntry(entry, foodsById.get(entry.foodItemId))));
    }
    hydratedFromDiary.current = true;
  }, [diary.data?.byMeal, diary.isLoading, foodsById, isEditMode, sourceDate, sourceMealSlot]);

  useEffect(() => {
    if (!isEditMode || !editingMeal || hydratedFromSavedMeal.current) {
      return;
    }

    setMealName(editingMeal.name);
    setDraftItems(editingMeal.items.map((item) => draftItemFromSavedMealItem(item, foodsById.get(item.foodItemId))));
    hydratedFromSavedMeal.current = true;
  }, [editingMeal, foodsById, isEditMode]);

  const totals = useMemo(() => mealTotals(draftItems), [draftItems]);
  const results = query.trim().length ? searchedFoods.data ?? [] : recentFoods.data ?? [];

  const saveMealMutation = useMutation({
    mutationFn: async () => {
      const items: SavedMealItemInput[] = [];
      for (const item of draftItems) {
        const itemTotals = calculateDraftItemTotals(item);
        if (!itemTotals) {
          throw new Error(`Set a valid amount for ${item.foodName}.`);
        }
        items.push({
          foodItemId: item.foodItemId,
          food: item.food,
          servings: itemTotals.servings,
          quantityType: item.quantityType,
          totalGrams: itemTotals.totalGrams,
          totalCalories: itemTotals.totalCalories,
          totalProteinG: itemTotals.totalProteinG,
          totalCarbsG: itemTotals.totalCarbsG,
          totalFatG: itemTotals.totalFatG,
          mealSlot: item.mealSlot ?? sourceMealSlot ?? null,
        });
      }

      if (isEditMode && editingSavedMealId) {
        await updateSavedMeal({
          savedMealId: editingSavedMealId,
          name: mealName,
          items,
          notes: editingMeal?.notes ?? null,
          isFavorite: editingMeal?.isFavorite,
        });
        return;
      }

      await createSavedMeal({ name: mealName, items });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLibrary });
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert(isEditMode ? 'Edit meal' : 'Create meal', error instanceof Error ? error.message : 'Unable to save meal.');
    },
  });

  const deleteMealMutation = useMutation({
    mutationFn: async () => {
      if (!editingSavedMealId) {
        throw new Error('Meal not found.');
      }
      await deleteSavedMeal(editingSavedMealId);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLibrary });
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert('Delete meal', error instanceof Error ? error.message : 'Unable to delete meal.');
    },
  });

  const addFood = (food: FoodItem) => {
    void Haptics.selectionAsync();
    setDraftItems((current) => {
      const existingIndex = current.findIndex((item) => item.foodItemId === food.id);
      if (existingIndex < 0) {
        return [...current, draftItemFromFood(food)];
      }

      return current.map((item, index) => {
        if (index !== existingIndex) return item;
        const currentAmount = parsePositiveNumber(item.amountText) ?? 0;
        const nextAmount = item.quantityType === 'gram' ? currentAmount + item.gramsPerServing : currentAmount + 1;
        return { ...item, amountText: formatAmount(nextAmount) };
      });
    });
  };

  const updateItem = (draftId: string, updater: (item: DraftMealItem) => DraftMealItem) => {
    setDraftItems((current) => current.map((item) => (item.draftId === draftId ? updater(item) : item)));
  };

  const changeQuantityType = (draftId: string, quantityType: QuantityType) => {
    updateItem(draftId, (item) => {
      if (item.quantityType === quantityType) return item;
      const amount = parsePositiveNumber(item.amountText) ?? 1;
      const nextAmount = quantityType === 'gram' ? amount * item.gramsPerServing : amount / item.gramsPerServing;
      return { ...item, quantityType, amountText: formatAmount(nextAmount) };
    });
  };

  const adjustAmount = (draftId: string, delta: number) => {
    updateItem(draftId, (item) => {
      const current = parsePositiveNumber(item.amountText) ?? (item.quantityType === 'gram' ? 50 : 1);
      const step = item.quantityType === 'gram' ? 10 : 1;
      const next = Math.max(step, current + delta * step);
      return { ...item, amountText: formatAmount(next) };
    });
  };

  const removeItem = (draftId: string) => {
    setDraftItems((current) => current.filter((item) => item.draftId !== draftId));
  };

  const confirmDeleteMeal = () => {
    if (!isEditMode || !editingMeal) return;
    Alert.alert('Delete meal', `Delete "${editingMeal.name}" from saved meals?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMealMutation.mutate(),
      },
    ]);
  };

  const saveDisabled = saveMealMutation.isPending || !mealName.trim().length || !draftItems.length;

  if (isEditMode && nutritionLibrary.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading meal" />
      </Screen>
    );
  }

  if (isEditMode && !editingMeal) {
    return (
      <Screen scroll={false}>
        <EmptyState icon={Utensils} title="Meal not found" body="This saved meal may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen padded={false} resetScrollOnBlur style={styles.screenContent}>
      <View pointerEvents="none" style={styles.topGlowWrap}>
        <LinearGradient
          colors={['rgba(53,199,122,0.28)', 'rgba(53,199,122,0.12)', 'rgba(17,20,24,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.topGlow}
        />
      </View>

      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.72 : 1 }]}>
          <ChevronLeft size={21} color={theme.colors.text} />
        </Pressable>
        <AppText variant="title" style={styles.topBarTitle}>
          Meal details
        </AppText>
        <View style={styles.topBarSpacer} />
      </View>

      <View style={[styles.heroSurface, { borderColor: 'rgba(166,190,176,0.2)' }]}>
        <View style={styles.heroHeader}>
          {isNameEditing ? (
            <TextInput
              autoFocus
              value={mealName}
              onChangeText={setMealName}
              onBlur={() => setIsNameEditing(false)}
              onSubmitEditing={() => setIsNameEditing(false)}
              placeholder="Meal name"
              placeholderTextColor={theme.colors.muted}
              style={[styles.editableMealNameInput, { color: theme.colors.text, borderColor: 'rgba(166,190,176,0.4)' }]}
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setIsNameEditing(true)} style={({ pressed }) => [styles.editableMealName, { opacity: pressed ? 0.86 : 1 }]}>
              <AppText variant="hero" style={styles.heroTitle} numberOfLines={2}>
                {mealName.trim().length ? mealName : 'Untitled meal'}
              </AppText>
              <Pencil size={14} color={theme.colors.muted} />
            </Pressable>
          )}

          <AppText muted>
            {draftItems.length} item{draftItems.length === 1 ? '' : 's'} saved meal
          </AppText>
        </View>

        <View style={[styles.summaryCard, { borderColor: 'rgba(166,190,176,0.18)' }]}>
          <View style={styles.summaryTopRow}>
            <View>
              <AppText muted variant="small" weight="700">
                Total
              </AppText>
              <AppText style={styles.totalCalories}>{Math.round(totals.totalCalories)} kcal</AppText>
            </View>
            <NutritionButton
              label={saveMealMutation.isPending ? 'Saving...' : isEditMode ? 'Save changes' : 'Save meal'}
              icon={Check}
              onPress={() => saveMealMutation.mutate()}
              disabled={saveDisabled}
              style={styles.saveButton}
            />
          </View>
          <FoodMacroChips protein={roundTo(totals.totalProteinG)} carbs={roundTo(totals.totalCarbsG)} fat={roundTo(totals.totalFatG)} />
        </View>
      </View>

      {isEditMode ? (
        <Pressable
          accessibilityRole="button"
          disabled={deleteMealMutation.isPending}
          onPress={confirmDeleteMeal}
          style={({ pressed }) => [styles.deleteRow, { opacity: deleteMealMutation.isPending ? 0.5 : pressed ? 0.8 : 1 }]}
        >
          <Trash2 size={15} color={theme.colors.danger} />
          <AppText weight="700" style={{ color: theme.colors.danger }}>
            {deleteMealMutation.isPending ? 'Deleting meal...' : 'Delete meal'}
          </AppText>
        </Pressable>
      ) : null}

      <View style={[styles.searchBar, { borderColor: theme.colors.border }]}>
        <Search size={18} color={theme.colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Add food to this meal"
          placeholderTextColor={theme.colors.muted}
          style={[styles.searchInput, { color: theme.colors.text }]}
        />
      </View>

      <AppText variant="section">Meal items</AppText>
      {draftItems.length ? (
        <View style={styles.itemsList}>
          {draftItems.map((item) => {
            const itemTotals = calculateDraftItemTotals(item);
            const unitLabel = item.quantityType === 'gram' ? 'g' : 'serv';
            return (
              <View key={item.draftId} style={[styles.itemSurface, { borderColor: theme.colors.border }]}>
                <View style={styles.itemTopRow}>
                  <View style={styles.itemTitleWrap}>
                    <AppText weight="800" numberOfLines={1}>
                      {item.foodName}
                    </AppText>
                    <AppText muted variant="small" numberOfLines={1}>
                      {item.brandName ? `${item.brandName} • ` : ''}{itemTotals ? `${Math.round(itemTotals.totalCalories)} kcal` : 'Invalid amount'}
                    </AppText>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => removeItem(item.draftId)} style={({ pressed }) => [styles.deleteChip, { opacity: pressed ? 0.72 : 1 }]}>
                    <Trash2 size={14} color={theme.colors.danger} />
                  </Pressable>
                </View>

                <View style={styles.itemControlsRow}>
                  <View style={styles.segmentControl}>
                    {(['portion', 'gram'] as const).map((type) => {
                      const active = item.quantityType === type;
                      return (
                        <Pressable
                          key={type}
                          accessibilityRole="button"
                          onPress={() => changeQuantityType(item.draftId, type)}
                          style={({ pressed }) => [
                            styles.segmentItem,
                            {
                              backgroundColor: active ? 'rgba(53,199,122,0.2)' : 'transparent',
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <AppText weight={active ? '800' : '700'} variant="small" style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                            {type === 'portion' ? 'Portion' : 'Gram'}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[styles.stepperWrap, { borderColor: theme.colors.border }]}>
                    <Pressable accessibilityRole="button" onPress={() => adjustAmount(item.draftId, -1)} style={({ pressed }) => [styles.stepperButton, { opacity: pressed ? 0.76 : 1 }]}>
                      <Minus size={14} color={theme.colors.muted} />
                    </Pressable>
                    <TextInput
                      value={item.amountText}
                      onChangeText={(value) => updateItem(item.draftId, (current) => ({ ...current, amountText: value.replace(/[^0-9.,]/g, '') }))}
                      keyboardType="decimal-pad"
                      style={[styles.amountInput, { color: theme.colors.text }]}
                    />
                    <Pressable accessibilityRole="button" onPress={() => adjustAmount(item.draftId, 1)} style={({ pressed }) => [styles.stepperButton, { opacity: pressed ? 0.76 : 1 }]}>
                      <Plus size={14} color={theme.colors.muted} />
                    </Pressable>
                    <AppText muted variant="small" style={styles.unitLabel}>
                      {unitLabel}
                    </AppText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState icon={Utensils} title="No items yet" body="Search and add foods to build this reusable meal." />
      )}

      <View style={styles.resultsHeader}>
        <AppText variant="section">{query.trim().length ? 'Search results' : 'Recent foods'}</AppText>
      </View>
      {(query.trim().length ? searchedFoods.isLoading : recentFoods.isLoading) ? (
        <LoadingState label="Loading foods" />
      ) : results.length ? (
        <View style={styles.resultsList}>
          {results.map((food) => (
            <View key={food.id} style={[styles.resultRow, { borderColor: theme.colors.border }]}>
              <View style={styles.foodCopy}>
                <AppText weight="800" numberOfLines={2}>
                  {food.name}
                </AppText>
                <AppText muted variant="small">
                  {food.calories} kcal • {formatAmount(food.servingSize)} {food.servingUnit}
                </AppText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => addFood(food)} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.76 : 1 }]}>
                <Plus size={16} color="#08100C" strokeWidth={2.8} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon={Search} title="No foods found" body="Try another search or create a custom food first." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  topGlowWrap: {
    height: 250,
    left: -40,
    position: 'absolute',
    right: -40,
    top: -120,
  },
  topGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginLeft: -8,
    width: 36,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  topBarSpacer: {
    width: 36,
  },
  heroSurface: {
    backgroundColor: 'rgba(25,31,38,0.55)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
  },
  heroHeader: {
    gap: 7,
  },
  editableMealName: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderBottomColor: 'rgba(166,190,176,0.26)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  editableMealNameInput: {
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    maxWidth: '92%',
  },
  summaryCard: {
    backgroundColor: 'rgba(16,22,28,0.66)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  summaryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  totalCalories: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
  },
  saveButton: {
    minHeight: 44,
    minWidth: 136,
  },
  deleteRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(242,95,92,0.1)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 7,
    marginTop: -2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(22,29,35,0.66)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  itemsList: {
    gap: 10,
  },
  itemSurface: {
    backgroundColor: 'rgba(22,29,35,0.54)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  itemTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  itemTitleWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  deleteChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(242,95,92,0.14)',
    borderRadius: 7,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  itemControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  segmentControl: {
    backgroundColor: 'rgba(16,22,28,0.78)',
    borderRadius: 11,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 38,
    padding: 3,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 8,
  },
  stepperWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,22,28,0.86)',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 38,
    paddingHorizontal: 4,
    width: 134,
  },
  stepperButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  amountInput: {
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 0,
    textAlign: 'center',
    width: 40,
  },
  unitLabel: {
    marginLeft: 4,
    marginRight: 6,
  },
  resultsHeader: {
    marginTop: 4,
  },
  resultsList: {
    gap: 8,
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(22,29,35,0.44)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  foodCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
