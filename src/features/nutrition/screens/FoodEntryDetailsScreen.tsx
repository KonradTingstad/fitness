import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Minus, Plus, Scale, Utensils } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { addDiaryEntry } from '@/data/repositories/nutritionRepository';
import { FoodItem, MealSlot } from '@/domain/models';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'FoodEntryDetails'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type QuantityMode = 'portion' | 'amount';

const FOOD_AMOUNT_PRESETS = [30, 50, 100, 150];
const DRINK_AMOUNT_PRESETS = [100, 250, 330, 500];
const MEAL_SLOT_OPTIONS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

function parsePositiveNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatGram(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 1));
}

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 1));
}

function normalizeUnitToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function toMilliliters(value: number, unitRaw: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = normalizeUnitToken(unitRaw);
  if (!unit.length) {
    return null;
  }
  if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
    return value;
  }
  if (unit === 'l' || unit === 'liter' || unit === 'litre' || unit === 'liters' || unit === 'litres') {
    return value * 1000;
  }
  if (unit === 'cl' || unit === 'centiliter' || unit === 'centilitre') {
    return value * 10;
  }
  if (unit === 'dl' || unit === 'deciliter' || unit === 'decilitre') {
    return value * 100;
  }
  return null;
}

function toGrams(value: number, unitRaw: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = normalizeUnitToken(unitRaw);
  if (!unit.length) {
    return null;
  }
  if (unit === 'g' || unit === 'gram' || unit === 'grams') {
    return value;
  }
  if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') {
    return value * 1000;
  }
  return null;
}

function toBaseAmount(value: number, unitRaw: string, baseUnit: 'g' | 'ml'): number | null {
  if (baseUnit === 'ml') {
    return toMilliliters(value, unitRaw);
  }
  return toGrams(value, unitRaw);
}

function parsePackageSizeLabel(rawValue: string | null | undefined): { size: number | null; unit: 'g' | 'ml' | null } {
  if (!rawValue) return { size: null, unit: null };
  const normalized = String(rawValue).replace(/\u00a0/g, ' ').replace(/,/g, '.').toLowerCase();

  const multipackMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b/);
  if (multipackMatch) {
    const count = Number.parseFloat(multipackMatch[1]);
    const singleSize = Number.parseFloat(multipackMatch[2]);
    const unitToken = multipackMatch[3];
    if (Number.isFinite(count) && count > 0 && Number.isFinite(singleSize) && singleSize > 0) {
      if (unitToken === 'l') return { size: singleSize * 1000 * count, unit: 'ml' };
      if (unitToken === 'cl') return { size: singleSize * 10 * count, unit: 'ml' };
      if (unitToken === 'dl') return { size: singleSize * 100 * count, unit: 'ml' };
      if (unitToken === 'ml') return { size: singleSize * count, unit: 'ml' };
      if (unitToken === 'kg') return { size: singleSize * 1000 * count, unit: 'g' };
      if (unitToken === 'g') return { size: singleSize * count, unit: 'g' };
    }
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b/);
  if (!singleMatch) return { size: null, unit: null };
  const size = Number.parseFloat(singleMatch[1]);
  if (!Number.isFinite(size) || size <= 0) return { size: null, unit: null };
  const unitToken = singleMatch[2];
  if (unitToken === 'l') return { size: size * 1000, unit: 'ml' };
  if (unitToken === 'cl') return { size: size * 10, unit: 'ml' };
  if (unitToken === 'dl') return { size: size * 100, unit: 'ml' };
  if (unitToken === 'ml') return { size, unit: 'ml' };
  if (unitToken === 'kg') return { size: size * 1000, unit: 'g' };
  if (unitToken === 'g') return { size, unit: 'g' };
  return { size: null, unit: null };
}

function inferLikelyDrinkVolumeMl(food: FoodItem): number | null {
  const directPer100Ml = Number.isFinite(food.caffeineMgPer100Ml) ? Math.max(0, food.caffeineMgPer100Ml ?? 0) : 0;
  const caffeinePerCan = Number.isFinite(food.caffeineMgPerCan) ? Math.max(0, food.caffeineMgPerCan ?? 0) : 0;
  if (directPer100Ml <= 0 || caffeinePerCan <= 0) {
    return null;
  }
  if (Math.abs(directPer100Ml - caffeinePerCan) > 1) {
    return null;
  }
  if (food.sourceProvider !== 'oda_private_snapshot' && food.sourceProvider !== 'seed') {
    return null;
  }
  if (caffeinePerCan >= 140 && caffeinePerCan <= 260) return 500;
  if (caffeinePerCan >= 90 && caffeinePerCan < 140) return 330;
  if (caffeinePerCan >= 60 && caffeinePerCan < 90) return 250;
  return null;
}

function resolvePer100Value(per100Value: number | null | undefined, perServingValue: number, servingAmount: number): number | null {
  if (Number.isFinite(per100Value) && per100Value != null) {
    return Math.max(0, per100Value);
  }
  if (!Number.isFinite(perServingValue) || !Number.isFinite(servingAmount) || servingAmount <= 0) {
    return null;
  }
  return Math.max(0, (perServingValue * 100) / servingAmount);
}

function resolveFoodServingVolumeMl(food: FoodItem): number | null {
  const inferredDrinkVolume = inferLikelyDrinkVolumeMl(food);
  if (Number.isFinite(food.packageSize) && (food.packageSize ?? 0) > 0 && food.packageUnit === 'ml') {
    return food.packageSize ?? null;
  }
  const parsedPackage = parsePackageSizeLabel(food.packageSizeLabel);
  if (Number.isFinite(parsedPackage.size) && (parsedPackage.size ?? 0) > 0 && parsedPackage.unit === 'ml') {
    return parsedPackage.size ?? null;
  }
  const fromServingUnit = Number.isFinite(food.servingSize) && food.servingSize > 0
    ? toMilliliters(food.servingSize, food.servingUnit)
    : null;
  if (Number.isFinite(fromServingUnit) && (fromServingUnit ?? 0) > 0) {
    if ((fromServingUnit ?? 0) <= 120 && inferredDrinkVolume != null && inferredDrinkVolume > (fromServingUnit ?? 0)) {
      return inferredDrinkVolume;
    }
    return fromServingUnit ?? null;
  }
  if (inferredDrinkVolume != null) {
    return inferredDrinkVolume;
  }
  if (Number.isFinite(food.gramsPerServing) && food.gramsPerServing > 0) {
    return food.gramsPerServing;
  }
  return null;
}

function resolveFoodCaffeinePer100Ml(food: FoodItem): number | null {
  const directPer100Ml = Number.isFinite(food.caffeineMgPer100Ml) ? Math.max(0, food.caffeineMgPer100Ml ?? 0) : 0;
  const caffeinePerCan = Number.isFinite(food.caffeineMgPerCan) ? Math.max(0, food.caffeineMgPerCan ?? 0) : 0;
  const servingVolumeMl = resolveFoodServingVolumeMl(food);
  const hasServingVolume = Number.isFinite(servingVolumeMl) && (servingVolumeMl ?? 0) > 0;
  const derivedFromPerCan =
    caffeinePerCan > 0 && hasServingVolume
      ? (caffeinePerCan * 100) / servingVolumeMl!
      : null;

  if (directPer100Ml > 0) {
    // Some legacy/imported drinks store "mg per can" in the per-100ml field.
    // If that happens and we have a realistic can/bottle volume, normalize it.
    if (hasServingVolume && servingVolumeMl! >= 180) {
      if (caffeinePerCan > 0 && Math.abs(directPer100Ml - caffeinePerCan) <= 1 && derivedFromPerCan != null) {
        return Math.max(0, derivedFromPerCan);
      }
      if (directPer100Ml > 80) {
        const normalizedFromLikelyPerCan = (directPer100Ml * 100) / servingVolumeMl!;
        if (Number.isFinite(normalizedFromLikelyPerCan) && normalizedFromLikelyPerCan > 0 && normalizedFromLikelyPerCan <= 80) {
          return normalizedFromLikelyPerCan;
        }
      }
    }
    return directPer100Ml;
  }

  if (derivedFromPerCan != null) {
    return Math.max(0, derivedFromPerCan);
  }
  return null;
}

export function FoodEntryDetailsScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { food, mealSlot, localDate } = route.params;
  const itemLabel = food.itemType === 'drink' ? 'drikke' : 'matvare';
  const productType = food.productType ?? food.itemType;
  const baseUnit = food.baseUnit ?? (productType === 'drink' ? 'ml' : 'g');
  const servingMode = food.servingMode
    ?? (Number.isFinite(food.packageSize) && (food.packageSize ?? 0) > 0 ? 'fixed_package' : food.servingLabel ? 'suggested_amount' : 'custom_amount');
  const parsedPackage = parsePackageSizeLabel(food.packageSizeLabel);

  const packageAmountNumeric = Number.isFinite(food.packageSize) && (food.packageSize ?? 0) > 0 && food.packageUnit === baseUnit
    ? food.packageSize ?? null
    : null;
  const packageAmountParsed = Number.isFinite(parsedPackage.size) && (parsedPackage.size ?? 0) > 0 && parsedPackage.unit === baseUnit
    ? parsedPackage.size ?? null
    : null;
  const packageAmount = packageAmountNumeric ?? packageAmountParsed;
  const servingAmountFromUnit = Number.isFinite(food.servingSize) && food.servingSize > 0
    ? toBaseAmount(food.servingSize, food.servingUnit, baseUnit)
    : null;
  const resolvedServingAmount =
    Number.isFinite(servingAmountFromUnit) && (servingAmountFromUnit ?? 0) > 0
      ? servingAmountFromUnit!
      : null;
  const resolvedPackageAmount =
    Number.isFinite(packageAmount) && (packageAmount ?? 0) > 0
      ? packageAmount!
      : null;
  const defaultPortionAmount =
    servingMode === 'fixed_package'
      ? resolvedPackageAmount ?? resolvedServingAmount ?? 100
      : productType === 'drink'
        ? resolvedPackageAmount ?? resolvedServingAmount ?? 100
        : resolvedServingAmount ?? 100;
  const suggestedAmount =
    servingMode === 'suggested_amount'
    && resolvedServingAmount != null
      ? resolvedServingAmount
      : 100;
  const supportsPortionMode = servingMode !== 'custom_amount';
  const defaultMode: QuantityMode = servingMode === 'fixed_package' ? 'portion' : 'amount';
  const defaultAmount = servingMode === 'suggested_amount' ? suggestedAmount : 100;
  const servingLabel = food.servingLabel?.trim()
    || (servingMode === 'fixed_package' ? (productType === 'drink' ? '1 boks' : '1 enhet') : null);
  const amountUnitLabel = baseUnit;
  const amountPresets = baseUnit === 'ml' ? DRINK_AMOUNT_PRESETS : FOOD_AMOUNT_PRESETS;

  const [mode, setMode] = useState<QuantityMode>(defaultMode);
  const [servingsText, setServingsText] = useState('1');
  const [amountText, setAmountText] = useState(formatGram(defaultAmount));
  const [selectedMealSlot, setSelectedMealSlot] = useState<MealSlot>(mealSlot);

  const parsedServings = parsePositiveNumber(servingsText);
  const parsedAmount = parsePositiveNumber(amountText);

  const totals = useMemo(() => {
    const amountInBaseUnit = mode === 'portion'
      ? (parsedServings != null ? parsedServings * defaultPortionAmount : null)
      : parsedAmount;
    if (!amountInBaseUnit || amountInBaseUnit <= 0) {
      return null;
    }

    const servings =
      mode === 'portion'
        ? parsedServings ?? null
        : Number.isFinite(defaultPortionAmount) && defaultPortionAmount > 0
          ? amountInBaseUnit / defaultPortionAmount
          : null;
    if (!servings || servings <= 0) {
      return null;
    }

    const caloriesPer100 = resolvePer100Value(food.caloriesPer100, Math.max(0, food.calories), defaultPortionAmount);
    const proteinPer100 = resolvePer100Value(food.proteinPer100, Math.max(0, food.proteinG), defaultPortionAmount);
    const carbsPer100 = resolvePer100Value(food.carbsPer100, Math.max(0, food.carbsG), defaultPortionAmount);
    const fatPer100 = resolvePer100Value(food.fatPer100, Math.max(0, food.fatG), defaultPortionAmount);
    const fiberPer100 = resolvePer100Value(food.fiberPer100, Math.max(0, food.fiberG ?? 0), defaultPortionAmount);
    const sugarPer100 = resolvePer100Value(food.sugarPer100, Math.max(0, food.sugarG ?? 0), defaultPortionAmount);
    const saturatedFatPer100 = resolvePer100Value(food.saturatedFatPer100, Math.max(0, food.saturatedFatG ?? 0), defaultPortionAmount);
    const sodiumPer100 = resolvePer100Value(
      food.sodiumMg != null && food.saltPer100 != null ? Math.max(0, food.saltPer100) * 400 : null,
      Math.max(0, food.sodiumMg ?? 0),
      defaultPortionAmount,
    );
    const amountFactor = amountInBaseUnit / 100;
    const totalVolumeMl = baseUnit === 'ml' ? amountInBaseUnit : null;
    const caffeinePer100Ml = resolveFoodCaffeinePer100Ml(food);
    const caffeineFromPer100Ml =
      caffeinePer100Ml != null && totalVolumeMl != null
        ? roundTo((Math.max(0, caffeinePer100Ml) * totalVolumeMl) / 100)
        : null;
    const caffeineFromLegacyPerCan = food.caffeineMgPerCan == null ? null : roundTo(Math.max(0, food.caffeineMgPerCan) * servings);

    return {
      servings,
      totalAmount: amountInBaseUnit,
      totalVolumeMl,
      calories: caloriesPer100 != null ? Math.round(caloriesPer100 * amountFactor) : Math.round(Math.max(0, food.calories) * servings),
      protein: proteinPer100 != null ? roundTo(proteinPer100 * amountFactor) : roundTo(Math.max(0, food.proteinG) * servings),
      carbs: carbsPer100 != null ? roundTo(carbsPer100 * amountFactor) : roundTo(Math.max(0, food.carbsG) * servings),
      fat: fatPer100 != null ? roundTo(fatPer100 * amountFactor) : roundTo(Math.max(0, food.fatG) * servings),
      fiber: food.fiberG == null && food.fiberPer100 == null ? null : roundTo((fiberPer100 ?? 0) * amountFactor),
      sugar: food.sugarG == null && food.sugarPer100 == null ? null : roundTo((sugarPer100 ?? 0) * amountFactor),
      saturatedFat: food.saturatedFatG == null && food.saturatedFatPer100 == null ? null : roundTo((saturatedFatPer100 ?? 0) * amountFactor),
      sodiumMg: food.sodiumMg == null && sodiumPer100 == null ? null : roundTo((sodiumPer100 ?? 0) * amountFactor),
      caffeineMg: caffeineFromPer100Ml ?? caffeineFromLegacyPerCan,
      saltG: food.saltPer100 == null ? null : roundTo((Math.max(0, food.saltPer100) * amountInBaseUnit) / 100),
    };
  }, [
    baseUnit,
    defaultPortionAmount,
    food.calories,
    food.caloriesPer100,
    food.proteinG,
    food.proteinPer100,
    food.carbsG,
    food.carbsPer100,
    food.fatG,
    food.fatPer100,
    food.fiberG,
    food.fiberPer100,
    food.sugarG,
    food.sugarPer100,
    food.saturatedFatG,
    food.saturatedFatPer100,
    food.sodiumMg,
    food.caffeineMgPer100Ml,
    food.caffeineMgPerCan,
    food.saltPer100,
    mode,
    parsedServings,
    parsedAmount,
  ]);

  const optionalRows = useMemo(
    () => [
      { key: 'fiber', label: 'Fiber', value: totals?.fiber, unit: 'g' },
      { key: 'sugar', label: 'Sugar', value: totals?.sugar, unit: 'g' },
      { key: 'saturatedFat', label: 'Saturated fat', value: totals?.saturatedFat, unit: 'g' },
      { key: 'sodium', label: 'Sodium', value: totals?.sodiumMg, unit: 'mg' },
      { key: 'salt', label: 'Salt', value: totals?.saltG, unit: 'g' },
      { key: 'caffeine', label: 'Caffeine', value: totals?.caffeineMg, unit: 'mg' },
    ].filter((item) => item.value != null),
    [totals?.fiber, totals?.sugar, totals?.saturatedFat, totals?.sodiumMg, totals?.saltG, totals?.caffeineMg],
  );

  const addFood = useMutation({
    mutationFn: async () => {
      if (!totals) {
        throw new Error('Choose a valid amount greater than zero.');
      }

      await addDiaryEntry({
        localDate,
        mealSlot: selectedMealSlot,
        foodItemId: food.id,
        food,
        servings: totals.servings,
        quantityType: mode === 'portion' ? 'portion' : 'gram',
        totalGrams: totals.totalAmount,
        totalCalories: totals.calories,
        totalProteinG: totals.protein,
        totalCarbsG: totals.carbs,
        totalFatG: totals.fat,
      });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.caffeineToday(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey)
          && (query.queryKey[0] === 'foodSearch' || query.queryKey[0] === 'recentFoods' || query.queryKey[0] === 'frequentlyLoggedFoods'),
      });

      const routes = navigation.getState().routes;
      const previousName = routes[routes.length - 2]?.name;
      if (previousName === 'FoodSearch' && routes.length >= 3) {
        navigation.pop(2);
      } else {
        navigation.goBack();
      }
    },
    onError: (error) => {
      Alert.alert(`Legg til ${itemLabel}`, error instanceof Error ? error.message : `Kunne ikke legge til ${itemLabel}.`);
    },
  });

  const adjustServings = (delta: number) => {
    const current = parsedServings ?? 1;
    const step = productType === 'drink' ? 0.5 : 1;
    const next = Math.max(step, roundTo(current + delta * step, 2));
    setServingsText(formatGram(next));
  };

  const switchMode = (nextMode: QuantityMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    if (nextMode === 'amount' && !parsePositiveNumber(amountText)) {
      const servings = parsePositiveNumber(servingsText) ?? 1;
      setAmountText(formatGram(servings * defaultPortionAmount));
    }
    if (nextMode === 'portion' && !parsePositiveNumber(servingsText)) {
      const amount = parsePositiveNumber(amountText);
      const servings = amount ? Math.max(0.25, roundTo(amount / defaultPortionAmount, 2)) : 1;
      setServingsText(formatGram(servings));
    }
  };

  return (
    <NutritionScreen>
      <NutritionCard style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(53,199,122,0.14)' }]}>
            <Utensils size={19} color={theme.colors.primary} />
          </View>
          <View style={styles.heroCopy}>
            <AppText weight="800" style={styles.foodName} numberOfLines={3}>
              {food.name}
            </AppText>
            {food.brandName ? (
              <AppText variant="small" muted>
                {food.brandName}
              </AppText>
            ) : null}
            <AppText variant="small" muted>
              {MEAL_SLOT_LABELS[selectedMealSlot]} • {localDate}
            </AppText>
          </View>
        </View>

        <View style={styles.heroCaloriesRow}>
          <AppText variant="small" muted>
            Calories for selected amount
          </AppText>
          <AppText weight="800" style={styles.heroCalories}>
            {totals?.calories ?? 0} kcal
          </AppText>
        </View>

        <FoodMacroChips protein={totals?.protein ?? 0} carbs={totals?.carbs ?? 0} fat={totals?.fat ?? 0} />
      </NutritionCard>

      <NutritionCard>
        <AppText variant="section">Log to meal</AppText>
        <View style={styles.mealSlotRow}>
          {MEAL_SLOT_OPTIONS.map((slot) => {
            const active = slot === selectedMealSlot;
            return (
              <Pressable
                key={slot}
                onPress={() => setSelectedMealSlot(slot)}
                style={({ pressed }) => [
                  styles.mealSlotButton,
                  {
                    backgroundColor: active ? 'rgba(53,199,122,0.16)' : 'rgba(31,39,48,0.48)',
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                  {MEAL_SLOT_LABELS[slot]}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </NutritionCard>

      <NutritionCard>
        <AppText variant="section">Amount</AppText>

        {supportsPortionMode ? (
          <View style={styles.modeRow}>
            {(['portion', 'amount'] as const).map((option) => {
              const active = option === mode;
              return (
                <Pressable
                  key={option}
                  onPress={() => switchMode(option)}
                  style={({ pressed }) => [
                    styles.modeButton,
                    {
                      backgroundColor: active ? 'rgba(53,199,122,0.16)' : 'rgba(31,39,48,0.48)',
                      opacity: pressed ? 0.84 : 1,
                    },
                  ]}
                >
                  {option === 'amount' ? <Scale size={15} color={active ? theme.colors.primary : theme.colors.muted} /> : <Utensils size={15} color={active ? theme.colors.primary : theme.colors.muted} />}
                  <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                    {option === 'portion' ? 'Enhet' : baseUnit === 'ml' ? 'Ml' : 'Gram'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {mode === 'portion' && supportsPortionMode ? (
          <View style={styles.amountRow}>
            <Pressable onPress={() => adjustServings(-1)} style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}> 
              <Minus size={16} color={theme.colors.primary} />
            </Pressable>

            <View style={styles.amountInputWrap}>
              <TextInput
                value={servingsText}
                onChangeText={(value) => setServingsText(value.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: theme.colors.text }]}
                placeholder="1"
                placeholderTextColor={theme.colors.muted}
              />
              <AppText variant="small" muted>
                {servingLabel ?? '1 enhet'} • {formatGram(defaultPortionAmount)} {amountUnitLabel}
              </AppText>
            </View>

            <Pressable onPress={() => adjustServings(1)} style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}>
              <Plus size={16} color={theme.colors.primary} />
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.gramInputWrap}>
              <TextInput
                value={amountText}
                onChangeText={(value) => setAmountText(value.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: theme.colors.text }]}
                placeholder={formatGram(defaultAmount)}
                placeholderTextColor={theme.colors.muted}
              />
              <AppText variant="small" muted>
                {amountUnitLabel}
              </AppText>
            </View>

            <View style={styles.gramPresetRow}>
              {amountPresets.map((amount) => (
                <Pressable
                  key={amount}
                  onPress={() => setAmountText(String(amount))}
                  style={({ pressed }) => [
                    styles.gramPreset,
                    {
                      backgroundColor: 'rgba(31,39,48,0.46)',
                      opacity: pressed ? 0.84 : 1,
                    },
                  ]}
                >
                  <AppText weight="700">{amount} {amountUnitLabel}</AppText>
                </Pressable>
              ))}
            </View>
            {servingMode === 'suggested_amount' && servingLabel ? (
              <AppText variant="small" muted>
                Suggested: {servingLabel} • {formatGram(suggestedAmount)} {amountUnitLabel}
              </AppText>
            ) : null}
          </>
        )}

        <AppText variant="small" muted>
          {servingMode === 'fixed_package'
            ? `${servingLabel ?? '1 enhet'} = ${formatGram(defaultPortionAmount)} ${amountUnitLabel}`
            : `Nutrition is calculated per 100 ${amountUnitLabel} from the logged amount.`}
        </AppText>
      </NutritionCard>

      <NutritionCard>
        <AppText variant="section">Nutrition for selected amount</AppText>

        <View style={styles.nutritionRows}>
          <NutrientRow label="Calories" value={totals?.calories ?? 0} unit="kcal" />
          <NutrientRow label="Protein" value={totals?.protein ?? 0} unit="g" />
          <NutrientRow label="Carbs" value={totals?.carbs ?? 0} unit="g" />
          <NutrientRow label="Fat" value={totals?.fat ?? 0} unit="g" />
          {optionalRows.map((row) => (
            <NutrientRow key={row.key} label={row.label} value={row.value ?? 0} unit={row.unit} />
          ))}
        </View>
      </NutritionCard>

      <NutritionButton
        label={`Legg til ${itemLabel}`}
        icon={Plus}
        disabled={!totals || addFood.isPending}
        onPress={() => addFood.mutate()}
      />
    </NutritionScreen>
  );
}

function NutrientRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View style={styles.nutrientRow}>
      <AppText muted>{label}</AppText>
      <AppText weight="800">
        {formatMacro(value)} {unit}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 12,
    padding: 14,
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  foodName: {
    fontSize: 19,
    lineHeight: 24,
  },
  heroCaloriesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCalories: {
    fontSize: 22,
    lineHeight: 26,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mealSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealSlotButton: {
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  stepperButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  amountInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.42)',
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gramInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(31,39,48,0.42)',
    borderRadius: 10,
    gap: 2,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: '800',
    minWidth: 92,
    paddingVertical: 0,
    textAlign: 'center',
  },
  gramPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gramPreset: {
    alignItems: 'center',
    borderRadius: 999,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  nutritionRows: {
    gap: 9,
  },
  nutrientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
