import { z } from 'zod';

export const customFoodSchema = z.object({
  name: z.string().min(2),
  brandName: z.string().optional(),
  servingSize: z.coerce.number().positive(),
  servingUnit: z.string().min(1),
  gramsPerServing: z.coerce.number().positive(),
  calories: z.coerce.number().min(0),
  proteinG: z.coerce.number().min(0),
  carbsG: z.coerce.number().min(0),
  fatG: z.coerce.number().min(0),
  fiberG: z.coerce.number().min(0).optional(),
  sodiumMg: z.coerce.number().min(0).optional(),
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
