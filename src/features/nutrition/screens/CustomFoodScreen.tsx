import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { addDiaryEntry, createCustomFood } from '@/data/repositories/nutritionRepository';
import { FoodItemType } from '@/domain/models';
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
  const initialMode: FoodItemType = route.params.mode ?? 'food';
  const [itemType, setItemType] = useState<FoodItemType>(initialMode);
  const modeLabel = itemType === 'drink' ? 'drink' : 'food';
  const [form, setForm] = useState({
    name: '',
    brandName: '',
    barcode: '',
    servingSize: '1',
    servingUnit: 'serving',
    gramsPerServing: '100',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    fiberG: '',
    sugarG: '',
    saturatedFatG: '',
    sodiumMg: '',
    caffeineMgPerCan: '',
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = customFoodSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid custom food');
      }
      const foodId = await createCustomFood(parsed.data, undefined, itemType);
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
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey)
          && (query.queryKey[0] === 'foodSearch' || query.queryKey[0] === 'recentFoods' || query.queryKey[0] === 'frequentlyLoggedFoods'),
      });
      navigation.goBack();
    },
    onError: (error) => Alert.alert(`Custom ${modeLabel}`, error instanceof Error ? error.message : `Unable to save ${modeLabel}.`),
  });

  return (
    <NutritionScreen>
      <NutritionCard>
        <AppText variant="section">Type</AppText>
        <View style={styles.typeRow}>
          <TypeChip label="Food" value="food" current={itemType} onChange={setItemType} />
          <TypeChip label="Drink" value="drink" current={itemType} onChange={setItemType} />
        </View>
      </NutritionCard>
      <NutritionCard>
        <AppText variant="section">{itemType === 'drink' ? 'Drink identity' : 'Food identity'}</AppText>
        <Field label="Name" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} />
        <Field label="Brand" value={form.brandName} onChangeText={(brandName) => setForm((current) => ({ ...current, brandName }))} />
        <Field label="Barcode (optional)" value={form.barcode} onChangeText={(barcode) => setForm((current) => ({ ...current, barcode }))} keyboardType="numeric" />
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
        <AppText muted variant="small">
          Required: Calories, Protein, Carbs, Fat. Everything else is optional.
        </AppText>
        <View style={styles.two}>
          <Field label="Calories *" value={form.calories} onChangeText={(calories) => setForm((current) => ({ ...current, calories }))} keyboardType="decimal-pad" />
          <Field label="Protein *" value={form.proteinG} onChangeText={(proteinG) => setForm((current) => ({ ...current, proteinG }))} keyboardType="decimal-pad" />
        </View>
        <View style={styles.two}>
          <Field label="Carbs *" value={form.carbsG} onChangeText={(carbsG) => setForm((current) => ({ ...current, carbsG }))} keyboardType="decimal-pad" />
          <Field label="Fat *" value={form.fatG} onChangeText={(fatG) => setForm((current) => ({ ...current, fatG }))} keyboardType="decimal-pad" />
        </View>
        <View style={styles.two}>
          <Field label="Fiber (optional)" value={form.fiberG} onChangeText={(fiberG) => setForm((current) => ({ ...current, fiberG }))} keyboardType="decimal-pad" />
          <Field label="Sugar g (optional)" value={form.sugarG} onChangeText={(sugarG) => setForm((current) => ({ ...current, sugarG }))} keyboardType="decimal-pad" />
        </View>
        <View style={styles.two}>
          <Field label="Saturated fat g (optional)" value={form.saturatedFatG} onChangeText={(saturatedFatG) => setForm((current) => ({ ...current, saturatedFatG }))} keyboardType="decimal-pad" />
          <Field label="Sodium mg (optional)" value={form.sodiumMg} onChangeText={(sodiumMg) => setForm((current) => ({ ...current, sodiumMg }))} keyboardType="decimal-pad" />
        </View>
        {itemType === 'drink' ? (
          <Field label="Caffeine mg per can" value={form.caffeineMgPerCan} onChangeText={(caffeineMgPerCan) => setForm((current) => ({ ...current, caffeineMgPerCan }))} keyboardType="decimal-pad" />
        ) : null}
      </NutritionCard>
      <NutritionButton label={`Save and log ${modeLabel}`} icon={Save} onPress={() => save.mutate()} />
      <AppText muted variant="small" style={{ color: theme.colors.muted }}>
        Custom {modeLabel}s are stored locally first and queued for sync when Supabase is configured.
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
  keyboardType?: 'default' | 'decimal-pad' | 'numeric';
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

function TypeChip({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: FoodItemType;
  current: FoodItemType;
  onChange: (value: FoodItemType) => void;
}) {
  const theme = useAppTheme();
  const active = current === value;
  return (
    <Pressable
      onPress={() => onChange(value)}
      style={({ pressed }) => [
        styles.typeChip,
        {
          backgroundColor: active ? 'rgba(53,199,122,0.16)' : 'rgba(31,39,48,0.42)',
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeChip: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
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
