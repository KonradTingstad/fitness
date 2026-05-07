import { z } from 'zod';

function parseNumberInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return undefined;
  }
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

function requiredNumberField(label: string) {
  return z.preprocess(
    parseNumberInput,
    z.number().min(0, `${label} must be 0 or greater`),
  );
}

function positiveRequiredNumberField(label: string) {
  return z.preprocess(
    parseNumberInput,
    z.number().positive(`${label} must be greater than 0`),
  );
}

function optionalNumberField(label: string) {
  return z.preprocess(
    parseNumberInput,
    z.number().min(0, `${label} must be 0 or greater`).optional(),
  );
}

export const customFoodSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  brandName: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length ? value : undefined)),
  servingSize: positiveRequiredNumberField('Serving size'),
  servingUnit: z.string().trim().min(1, 'Serving unit is required'),
  gramsPerServing: positiveRequiredNumberField('Grams per serving'),
  calories: requiredNumberField('Calories'),
  proteinG: requiredNumberField('Protein'),
  carbsG: requiredNumberField('Carbs'),
  fatG: requiredNumberField('Fat'),
  fiberG: optionalNumberField('Fiber'),
  sugarG: optionalNumberField('Sugar'),
  saturatedFatG: optionalNumberField('Saturated fat'),
  sodiumMg: optionalNumberField('Sodium'),
  caffeineMgPer100Ml: optionalNumberField('Caffeine (mg per 100 ml)'),
  barcode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length ? value : undefined)),
});

export const onboardingSchema = z.object({
  heightCm: z.coerce.number().min(100).max(240),
  currentWeightKg: z.coerce.number().min(35).max(300),
  calorieTarget: z.coerce.number().min(900).max(7000),
  proteinTargetG: z.coerce.number().min(20).max(400),
  workoutsPerWeekTarget: z.coerce.number().min(0).max(14),
});

export type CustomFoodForm = z.infer<typeof customFoodSchema>;
export type OnboardingForm = z.infer<typeof onboardingSchema>;
