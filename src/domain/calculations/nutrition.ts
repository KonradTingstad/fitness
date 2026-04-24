import { DiaryEntry, GoalSettings, NutritionTotals } from '@/domain/models';

export const emptyNutritionTotals = (): NutritionTotals => ({
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sodiumMg: 0,
});

export function roundNutrition(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function sumDiaryEntries(entries: DiaryEntry[]): NutritionTotals {
  return entries.reduce<NutritionTotals>((totals, entry) => {
    totals.calories += entry.caloriesSnapshot * entry.servings;
    totals.proteinG += entry.proteinGSnapshot * entry.servings;
    totals.carbsG += entry.carbsGSnapshot * entry.servings;
    totals.fatG += entry.fatGSnapshot * entry.servings;
    totals.fiberG += (entry.fiberGSnapshot ?? 0) * entry.servings;
    totals.sodiumMg += (entry.sodiumMgSnapshot ?? 0) * entry.servings;
    return totals;
  }, emptyNutritionTotals());
}

export function remainingMacros(totals: NutritionTotals, goals: GoalSettings): NutritionTotals {
  return {
    calories: roundNutrition(goals.calorieTarget - totals.calories),
    proteinG: roundNutrition(goals.proteinTargetG - totals.proteinG),
    carbsG: roundNutrition(goals.carbTargetG - totals.carbsG),
    fatG: roundNutrition(goals.fatTargetG - totals.fatG),
    fiberG: 0,
    sodiumMg: 0,
  };
}

export function macroCalories(totals: NutritionTotals): { protein: number; carbs: number; fat: number } {
  return {
    protein: totals.proteinG * 4,
    carbs: totals.carbsG * 4,
    fat: totals.fatG * 9,
  };
}

export function adherencePercent(consumed: number, target: number, tolerance = 0.1): number {
  if (target <= 0) {
    return 0;
  }
  const lower = target * (1 - tolerance);
  const upper = target * (1 + tolerance);
  if (consumed >= lower && consumed <= upper) {
    return 100;
  }
  const distance = consumed < lower ? lower - consumed : consumed - upper;
  return Math.max(0, Math.round(100 - (distance / target) * 100));
}

export function scaleFoodNutrients<T extends NutritionTotals>(nutrients: T, servings: number): T {
  return {
    ...nutrients,
    calories: roundNutrition(nutrients.calories * servings),
    proteinG: roundNutrition(nutrients.proteinG * servings),
    carbsG: roundNutrition(nutrients.carbsG * servings),
    fatG: roundNutrition(nutrients.fatG * servings),
    fiberG: roundNutrition(nutrients.fiberG * servings),
    sodiumMg: roundNutrition(nutrients.sodiumMg * servings),
  };
}
