import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { addDiaryEntry, createCustomFood } from '@/data/repositories/nutritionRepository';
import { NutritionButton, NutritionCard, NutritionScreen } from '@/features/nutrition/components/NutritionChrome';
import { customFoodSchema } from '@/domain/validation/forms';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'CustomFood'>;

export function CustomFoodScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    brandName: '',
    servingSize: '1',
    servingUnit: 'serving',
    gramsPerServing: '100',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
    sodiumMg: '',
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = customFoodSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid custom food');
      }
      const foodId = await createCustomFood(parsed.data);
      await addDiaryEntry({
        localDate: route.params.localDate,
        mealSlot: route.params.mealSlot,
        foodItemId: foodId,
        servings: 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.diary(route.params.localDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.foodSearch('') });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentFoods });
      queryClient.invalidateQueries({ queryKey: queryKeys.frequentlyLoggedFoods });
      navigation.goBack();
    },
    onError: (error) => Alert.alert('Custom food', error instanceof Error ? error.message : 'Unable to save food.'),
  });

  return (
    <NutritionScreen>
      <NutritionCard>
        <AppText variant="section">Food identity</AppText>
        <Field label="Name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} />
        <Field label="Brand" value={form.brandName} onChangeText={(brandName) => setForm((current) => ({ ...current, brandName }))} />
      </NutritionCard>
      <NutritionCard>
        <AppText variant="section">Serving</AppText>
        <View style={styles.two}>
          <Field label="Size" value={form.servingSize} onChangeText={(servingSize) => setForm((current) => ({ ...current, servingSize }))} keyboardType="decimal-pad" />
          <Field label="Unit" value={form.servingUnit} onChangeText={(servingUnit) => setForm((current) => ({ ...current, servingUnit }))} />
        </View>
        <Field label="Grams per serving" value={form.gramsPerServing} onChangeText={(gramsPerServing) => setForm((current) => ({ ...current, gramsPerServing }))} keyboardType="decimal-pad" />
      </NutritionCard>
      <NutritionCard>
        <AppText variant="section">Nutrition per serving</AppText>
        <View style={styles.two}>
          <Field label="Calories" value={form.calories} onChangeText={(calories) => setForm((current) => ({ ...current, calories }))} keyboardType="decimal-pad" />
          <Field label="Protein" value={form.proteinG} onChangeText={(proteinG) => setForm((current) => ({ ...current, proteinG }))} keyboardType="decimal-pad" />
        </View>
        <View style={styles.two}>
          <Field label="Carbs" value={form.carbsG} onChangeText={(carbsG) => setForm((current) => ({ ...current, carbsG }))} keyboardType="decimal-pad" />
          <Field label="Fat" value={form.fatG} onChangeText={(fatG) => setForm((current) => ({ ...current, fatG }))} keyboardType="decimal-pad" />
        </View>
        <View style={styles.two}>
          <Field label="Fiber" value={form.fiberG} onChangeText={(fiberG) => setForm((current) => ({ ...current, fiberG }))} keyboardType="decimal-pad" />
          <Field label="Sodium mg" value={form.sodiumMg} onChangeText={(sodiumMg) => setForm((current) => ({ ...current, sodiumMg }))} keyboardType="decimal-pad" />
        </View>
      </NutritionCard>
      <NutritionButton label="Save and log" icon={Save} onPress={() => save.mutate()} />
      <AppText muted variant="small" style={{ color: theme.colors.muted }}>
        Custom foods are stored locally first and queued for sync when Supabase is configured.
      </AppText>
    </NutritionScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.field}>
      <AppText variant="small" muted>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, { color: theme.colors.text, backgroundColor: 'rgba(36,44,54,0.82)' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  two: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  input: {
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
  },
});
