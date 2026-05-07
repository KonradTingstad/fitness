import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Barcode, Plus, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { FoodItem, FoodItemType, MealSlot } from '@/domain/models';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { FoodSuggestionStrip } from '@/features/nutrition/components/FoodSuggestionStrip';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { useFoodSearch, useFrequentlyLoggedFoods, useRecentFoods } from '@/hooks/useAppQueries';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'FoodSearch'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export function FoodSearchScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const mode: FoodItemType = route.params.mode ?? 'food';
  const modeLabel = mode === 'drink' ? 'drink' : 'food';
  const modePluralLabel = mode === 'drink' ? 'drinks' : 'foods';
  const foods = useFoodSearch(query, mode, { enabled: query.trim().length > 0 });
  const recent = useRecentFoods(mode);
  const suggestions = useFrequentlyLoggedFoods(mode);

  const openFoodEntryDetails = (food: FoodItem) => {
    void Haptics.selectionAsync();
    navigation.navigate('FoodEntryDetails', {
      food,
      localDate: route.params.localDate,
      mealSlot: route.params.mealSlot,
    });
  };

  const results = query.trim().length ? foods.data ?? [] : recent.data ?? [];
  const title = query.trim().length ? `Search ${modePluralLabel}` : `Recent ${modePluralLabel}`;
  const mealLabel = MEAL_SLOT_LABELS[route.params.mealSlot];

  return (
    <NutritionScreen>
      <View style={[styles.targetMealRow, { backgroundColor: theme.colors.surfaceAlt }]}>
        <AppText muted variant="small" weight="800">
          Adding to
        </AppText>
        <AppText weight="800">{mealLabel}</AppText>
      </View>

      <View style={[styles.searchBox, { backgroundColor: 'rgba(28,35,43,0.82)' }]}>
        <Search color={theme.colors.muted} size={20} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={`Search ${modePluralLabel}, brands, or barcode`}
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text }]}
        />
      </View>

      <View style={styles.quick}>
        <NutritionButton label={`Create ${modeLabel}`} icon={Plus} variant="soft" onPress={() => navigation.navigate('CustomFood', route.params)} style={styles.quickButton} />
        <NutritionButton label="Barcode" icon={Barcode} variant="soft" onPress={() => navigation.navigate('BarcodeScanner', route.params)} style={styles.quickButton} />
      </View>

      <FoodSuggestionStrip suggestions={suggestions.data ?? []} onSelect={openFoodEntryDetails} onLongPress={openFoodEntryDetails} />

      <AppText variant="section">{title}</AppText>
      {foods.isLoading || recent.isLoading ? (
        <LoadingState label={`Searching ${modePluralLabel}`} />
      ) : results.length ? (
        results.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onQuickAdd={() => openFoodEntryDetails(food)}
          />
        ))
      ) : (
        <EmptyState
          icon={Search}
          title={`No ${modeLabel} found`}
          body={`Try a broader search, create a ${modeLabel} manually, or scan a barcode when a provider is configured.`}
          actionLabel={`Create ${modeLabel}`}
          onAction={() => navigation.navigate('CustomFood', route.params)}
        />
      )}
    </NutritionScreen>
  );
}

function FoodRow({
  food,
  onQuickAdd,
}: {
  food: FoodItem;
  onQuickAdd: () => void;
}) {
  const theme = useAppTheme();
  const amountUnit = food.baseUnit ?? (food.itemType === 'drink' ? 'ml' : 'g');
  const basisLabel = food.nutritionBasis === 'per_100ml' ? 'per 100 ml' : 'per 100 g';
  const basisCalories = Number.isFinite(food.caloriesPer100) ? Math.round(food.caloriesPer100 ?? 0) : Math.round(food.calories);
  const fixedAmountLine =
    Number.isFinite(food.servingSize) && food.servingSize > 0
      ? `${Math.round(food.servingSize)} ${food.servingUnit || amountUnit}`
      : Number.isFinite(food.packageSize) && (food.packageSize ?? 0) > 0 && food.packageUnit
        ? `${Math.round(food.packageSize ?? 0)} ${food.packageUnit}`
        : null;
  const packageLine =
    Number.isFinite(food.packageSize) && (food.packageSize ?? 0) > 0 && food.packageUnit
      ? `${Math.round(food.packageSize ?? 0)} ${food.packageUnit}`
      : null;
  const servingLine = food.servingMode === 'fixed_package'
    ? `${food.servingLabel ?? '1 enhet'}${fixedAmountLine ? ` • ${fixedAmountLine}` : packageLine ? ` • ${packageLine}` : ''}`
    : food.servingMode === 'suggested_amount'
      ? `${Math.round(food.servingSize)} ${amountUnit}${food.servingLabel ? ` • ${food.servingLabel}` : ''}`
      : `${basisLabel} basis`;
  return (
    <NutritionCard style={styles.foodCard}>
      <View style={styles.foodRow}>
        <View style={styles.foodCopy}>
          <AppText weight="800" numberOfLines={2} style={styles.foodName}>
            {food.name}
          </AppText>
          <AppText variant="small" muted style={styles.foodMeta}>
            {food.brandName ? `${food.brandName} • ` : ''}{servingLine}
          </AppText>
          <AppText variant="small" muted style={styles.foodMeta}>
            {basisCalories} kcal • {basisLabel}
          </AppText>
          <FoodMacroChips protein={food.proteinG} carbs={food.carbsG} fat={food.fatG} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onQuickAdd}
          style={({ pressed }) => [
            styles.add,
            { backgroundColor: theme.colors.primary },
            pressed && { opacity: 0.78, transform: [{ scale: 0.96 }] },
          ]}
        >
          <Plus color="#08100C" size={18} strokeWidth={3} />
        </Pressable>
      </View>
    </NutritionCard>
  );
}

const styles = StyleSheet.create({
  targetMealRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  quick: {
    flexDirection: 'row',
    gap: 10,
  },
  quickButton: {
    flex: 1,
  },
  foodCard: {
    padding: 14,
  },
  foodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 84,
  },
  foodCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  foodName: {
    fontSize: 17,
    lineHeight: 22,
  },
  foodMeta: {
    opacity: 0.72,
  },
  add: {
    alignItems: 'center',
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
});
