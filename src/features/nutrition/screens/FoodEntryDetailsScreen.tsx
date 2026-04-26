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
type QuantityMode = 'portion' | 'gram';

const GRAM_PRESETS = [50, 100, 150, 250];
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

function positiveOrFallback(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

export function FoodEntryDetailsScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { food, mealSlot, localDate } = route.params;

  const hasServingSize = Number.isFinite(food.servingSize) && food.servingSize > 0;
  const servingSize = positiveOrFallback(food.servingSize, 100);
  const servingUnit = hasServingSize ? (food.servingUnit?.trim() ? food.servingUnit : 'g') : 'g';
  const gramsPerServing = positiveOrFallback(food.gramsPerServing, 100);

  const [mode, setMode] = useState<QuantityMode>('portion');
  const [servingsText, setServingsText] = useState('1');
  const [gramsText, setGramsText] = useState(formatGram(gramsPerServing));

  const parsedServings = parsePositiveNumber(servingsText);
  const parsedGrams = parsePositiveNumber(gramsText);

  const totals = useMemo(() => {
    const servings = mode === 'portion' ? parsedServings : parsedGrams ? parsedGrams / gramsPerServing : null;
    if (!servings || servings <= 0) {
      return null;
    }

    const totalGrams = servings * gramsPerServing;
    return {
      servings,
      totalGrams,
      calories: Math.round(Math.max(0, food.calories) * servings),
      protein: roundTo(Math.max(0, food.proteinG) * servings),
      carbs: roundTo(Math.max(0, food.carbsG) * servings),
      fat: roundTo(Math.max(0, food.fatG) * servings),
      fiber: food.fiberG == null ? null : roundTo(Math.max(0, food.fiberG) * servings),
      sugar: food.sugarG == null ? null : roundTo(Math.max(0, food.sugarG) * servings),
      saturatedFat: food.saturatedFatG == null ? null : roundTo(Math.max(0, food.saturatedFatG) * servings),
      sodiumMg: food.sodiumMg == null ? null : roundTo(Math.max(0, food.sodiumMg) * servings),
    };
  }, [food.calories, food.proteinG, food.carbsG, food.fatG, food.fiberG, food.sugarG, food.saturatedFatG, food.sodiumMg, gramsPerServing, mode, parsedServings, parsedGrams]);

  const optionalRows = useMemo(
    () => [
      { key: 'fiber', label: 'Fiber', value: totals?.fiber, unit: 'g' },
      { key: 'sugar', label: 'Sugar', value: totals?.sugar, unit: 'g' },
      { key: 'saturatedFat', label: 'Saturated fat', value: totals?.saturatedFat, unit: 'g' },
      { key: 'sodium', label: 'Sodium', value: totals?.sodiumMg, unit: 'mg' },
    ].filter((item) => item.value != null),
    [totals?.fiber, totals?.sugar, totals?.saturatedFat, totals?.sodiumMg],
  );

  const addFood = useMutation({
    mutationFn: async () => {
      if (!totals) {
        throw new Error('Choose a valid amount greater than zero.');
      }

      await addDiaryEntry({
        localDate,
        mealSlot,
        foodItemId: food.id,
        food,
        servings: totals.servings,
        quantityType: mode,
        totalGrams: totals.totalGrams,
        totalCalories: totals.calories,
        totalProteinG: totals.protein,
        totalCarbsG: totals.carbs,
        totalFatG: totals.fat,
      });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.weeklyCalories(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calorieStreak(localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      queryClient.invalidateQueries({ queryKey: queryKeys.frequentlyLoggedFoods });

      const routes = navigation.getState().routes;
      const previousName = routes[routes.length - 2]?.name;
      if (previousName === 'FoodSearch' && routes.length >= 3) {
        navigation.pop(2);
      } else {
        navigation.goBack();
      }
    },
    onError: (error) => {
      Alert.alert('Add food', error instanceof Error ? error.message : 'Unable to add food.');
    },
  });

  const adjustServings = (delta: number) => {
    const current = parsedServings ?? 1;
    const next = Math.max(1, Math.round(current + delta));
    setServingsText(String(next));
  };

  const switchMode = (nextMode: QuantityMode) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    if (nextMode === 'gram' && !parsePositiveNumber(gramsText)) {
      const servings = parsePositiveNumber(servingsText) ?? 1;
      setGramsText(formatGram(servings * gramsPerServing));
    }
    if (nextMode === 'portion' && !parsePositiveNumber(servingsText)) {
      const grams = parsePositiveNumber(gramsText);
      const servings = grams ? Math.max(1, Math.round(grams / gramsPerServing)) : 1;
      setServingsText(String(servings));
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
              {MEAL_SLOT_LABELS[mealSlot]} • {localDate}
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
        <AppText variant="section">Amount</AppText>

        <View style={styles.modeRow}>
          {(['portion', 'gram'] as const).map((option) => {
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
                {option === 'gram' ? <Scale size={15} color={active ? theme.colors.primary : theme.colors.muted} /> : <Utensils size={15} color={active ? theme.colors.primary : theme.colors.muted} />}
                <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                  {option === 'portion' ? 'Portion' : 'Gram'}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {mode === 'portion' ? (
          <View style={styles.amountRow}>
            <Pressable onPress={() => adjustServings(-1)} style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}> 
              <Minus size={16} color={theme.colors.primary} />
            </Pressable>

            <View style={styles.amountInputWrap}>
              <TextInput
                value={servingsText}
                onChangeText={(value) => setServingsText(value.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                style={[styles.amountInput, { color: theme.colors.text }]}
                placeholder="1"
                placeholderTextColor={theme.colors.muted}
              />
              <AppText variant="small" muted>
                portions × {formatGram(servingSize)} {servingUnit}
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
                value={gramsText}
                onChangeText={(value) => setGramsText(value.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: theme.colors.text }]}
                placeholder={formatGram(gramsPerServing)}
                placeholderTextColor={theme.colors.muted}
              />
              <AppText variant="small" muted>
                grams
              </AppText>
            </View>

            <View style={styles.gramPresetRow}>
              {GRAM_PRESETS.map((grams) => (
                <Pressable
                  key={grams}
                  onPress={() => setGramsText(String(grams))}
                  style={({ pressed }) => [
                    styles.gramPreset,
                    {
                      backgroundColor: 'rgba(31,39,48,0.46)',
                      opacity: pressed ? 0.84 : 1,
                    },
                  ]}
                >
                  <AppText weight="700">{grams} g</AppText>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <AppText variant="small" muted>
          1 serving = {formatGram(gramsPerServing)} g
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
        label="Legg til matvare"
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
