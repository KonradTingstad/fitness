import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Barcode, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { FoodItem, MealSlot } from '@/domain/models';
import { FoodMacroChips } from '@/features/nutrition/components/FoodMacroChips';
import { FoodSuggestionStrip } from '@/features/nutrition/components/FoodSuggestionStrip';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { resolveLastUsedMealSlot } from '@/features/nutrition/utils/foodLogInteractions';
import { useDiary, useFoodSearch, useFrequentlyLoggedFoods, useRecentFoods } from '@/hooks/useAppQueries';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'FoodSearch'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FoodSearchScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const diary = useDiary(route.params.localDate);
  const foods = useFoodSearch(query);
  const recent = useRecentFoods();
  const suggestions = useFrequentlyLoggedFoods();
  const lastUsedMealSlot = useMemo(
    () => resolveLastUsedMealSlot(diary.data?.day.entries ?? [], route.params.mealSlot),
    [diary.data?.day.entries, route.params.mealSlot],
  );

  const openFoodEntryDetails = (food: FoodItem, mealSlot: MealSlot) => {
    void Haptics.selectionAsync();
    navigation.navigate('FoodEntryDetails', {
      food,
      localDate: route.params.localDate,
      mealSlot,
    });
  };

  const openDefaultFoodEntryDetails = (food: FoodItem) => openFoodEntryDetails(food, lastUsedMealSlot);

  const results = query.trim().length ? foods.data ?? [] : recent.data ?? [];
  const title = query.trim().length ? 'Search results' : 'Recent foods';

  return (
    <NutritionScreen>
      <View style={[styles.searchBox, { backgroundColor: 'rgba(28,35,43,0.82)' }]}>
        <Search color={theme.colors.muted} size={20} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search foods, brands, or barcode"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text }]}
        />
      </View>

      <View style={styles.quick}>
        <NutritionButton label="Custom food" icon={Plus} variant="soft" onPress={() => navigation.navigate('CustomFood', route.params)} style={styles.quickButton} />
        <NutritionButton label="Barcode" icon={Barcode} variant="soft" onPress={() => navigation.navigate('BarcodeScanner', route.params)} style={styles.quickButton} />
      </View>

      <FoodSuggestionStrip suggestions={suggestions.data ?? []} onSelect={openDefaultFoodEntryDetails} onLongPress={openDefaultFoodEntryDetails} />

      <AppText variant="section">{title}</AppText>
      {foods.isLoading || recent.isLoading || diary.isLoading ? (
        <LoadingState label="Searching foods" />
      ) : results.length ? (
        results.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onQuickAdd={() => openDefaultFoodEntryDetails(food)}
          />
        ))
      ) : (
        <EmptyState
          icon={Search}
          title="No food found"
          body="Try a broader search, add a custom food, or scan a barcode when a provider is configured."
          actionLabel="Add custom food"
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
  return (
    <NutritionCard style={styles.foodCard}>
      <View style={styles.foodRow}>
        <View style={styles.foodCopy}>
          <AppText weight="800" numberOfLines={2} style={styles.foodName}>
            {food.name}
          </AppText>
          <AppText variant="small" muted style={styles.foodMeta}>
            {food.brandName ? `${food.brandName} • ` : ''}
            {food.servingSize} {food.servingUnit} • {food.calories} kcal
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
