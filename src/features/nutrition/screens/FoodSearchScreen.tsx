import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Barcode, Plus, Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { addDiaryEntry } from '@/data/repositories/nutritionRepository';
import { FoodItem } from '@/domain/models';
import { useFoodSearch, useRecentFoods } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'FoodSearch'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FoodSearchScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const foods = useFoodSearch(query);
  const recent = useRecentFoods();

  const addFood = useMutation({
    mutationFn: (food: FoodItem) =>
      addDiaryEntry({
        localDate: route.params.localDate,
        mealSlot: route.params.mealSlot,
        foodItemId: food.id,
        servings: 1,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(route.params.localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      navigation.goBack();
    },
  });

  const results = query.trim().length ? foods.data ?? [] : recent.data ?? [];
  const title = query.trim().length ? 'Search results' : 'Recent foods';

  return (
    <Screen>
      <View style={[styles.searchBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
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
        <Button label="Custom food" icon={Plus} variant="secondary" onPress={() => navigation.navigate('CustomFood', route.params)} style={styles.quickButton} />
        <Button label="Barcode" icon={Barcode} variant="secondary" onPress={() => navigation.navigate('BarcodeScanner', route.params)} style={styles.quickButton} />
      </View>

      <AppText variant="section">{title}</AppText>
      {foods.isLoading || recent.isLoading ? (
        <LoadingState label="Searching foods" />
      ) : results.length ? (
        results.map((food) => <FoodRow key={food.id} food={food} onPress={() => addFood.mutate(food)} />)
      ) : (
        <EmptyState
          icon={Search}
          title="No food found"
          body="Try a broader search, add a custom food, or scan a barcode when a provider is configured."
          actionLabel="Add custom food"
          onAction={() => navigation.navigate('CustomFood', route.params)}
        />
      )}
    </Screen>
  );
}

function FoodRow({ food, onPress }: { food: FoodItem; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Card>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.foodRow, pressed && { opacity: 0.82 }]}>
        <View style={styles.foodCopy}>
          <AppText weight="800">{food.name}</AppText>
          <AppText variant="small" muted>
            {food.brandName ? `${food.brandName} • ` : ''}
            {food.servingSize} {food.servingUnit} • {food.calories} kcal • {food.proteinG} g protein
          </AppText>
        </View>
        <View style={[styles.add, { backgroundColor: theme.colors.primary }]}>
          <Plus color="#08100C" size={18} strokeWidth={3} />
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
  foodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  foodCopy: {
    flex: 1,
    gap: 3,
  },
  add: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
