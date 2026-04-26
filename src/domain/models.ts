export type ID = string;

export type SyncStatus = 'synced' | 'pending' | 'failed';
export type GoalType = 'lose' | 'maintain' | 'gain' | 'custom';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
export type Sex = 'female' | 'male' | 'other' | 'prefer_not_to_say';
export type ThemeMode = 'system' | 'light' | 'dark';
export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export type VolumeUnit = 'ml' | 'oz';
export type EnergyUnit = 'kcal' | 'kj';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type WorkoutStatus = 'active' | 'completed' | 'discarded';
export type SetType =
  | 'warmup'
  | 'normal'
  | 'drop'
  | 'failure'
  | 'assisted'
  | 'bodyweight'
  | 'timed';

export interface AuditFields {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncStatus: SyncStatus;
  version: number;
}

export interface User extends AuditFields {
  id: ID;
  email: string;
  displayName?: string | null;
}

export interface UserProfile extends AuditFields {
  id: ID;
  userId: ID;
  age?: number | null;
  sex?: Sex | null;
  heightCm: number;
  currentWeightKg: number;
  dietPreferences?: string | null;
}

export interface UserSettings extends AuditFields {
  id: ID;
  userId: ID;
  theme: ThemeMode;
  notificationsEnabled: boolean;
  restTimerDefaultSeconds: number;
}

export interface UnitPreferences extends AuditFields {
  id: ID;
  userId: ID;
  bodyWeightUnit: WeightUnit;
  loadUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  volumeUnit: VolumeUnit;
  energyUnit: EnergyUnit;
}

export interface GoalSettings extends AuditFields {
  id: ID;
  userId: ID;
  goal: GoalType;
  activityLevel: ActivityLevel;
  workoutsPerWeekTarget: number;
  calorieTarget: number;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
  waterTargetMl: number;
}

export interface Exercise {
  id: ID;
  userId?: ID | null;
  name: string;
  primaryMuscle: string;
  equipment: string;
  instructions?: string | null;
  isCustom: boolean;
}

export interface Routine extends AuditFields {
  id: ID;
  userId: ID;
  name: string;
  notes?: string | null;
  sortOrder: number;
  exercises: RoutineExercise[];
}

export interface RoutineExercise extends AuditFields {
  id: ID;
  routineId: ID;
  exerciseId: ID;
  exercise?: Exercise;
  sortOrder: number;
  supersetGroup?: string | null;
  notes?: string | null;
  defaultRestSeconds: number;
  setTemplates: RoutineExerciseSetTemplate[];
}

export interface RoutineExerciseSetTemplate extends AuditFields {
  id: ID;
  routineExerciseId: ID;
  sortOrder: number;
  setType: SetType;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
}

export interface WorkoutSession extends AuditFields {
  id: ID;
  userId: ID;
  routineId?: ID | null;
  title: string;
  startedAt: string;
  endedAt?: string | null;
  status: WorkoutStatus;
  notes?: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutExercise extends AuditFields {
  id: ID;
  workoutSessionId: ID;
  exerciseId: ID;
  exercise?: Exercise;
  sortOrder: number;
  supersetGroup?: string | null;
  notes?: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutSet extends AuditFields {
  id: ID;
  workoutExerciseId: ID;
  sortOrder: number;
  setType: SetType;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  rir?: number | null;
  isCompleted: boolean;
  completedAt?: string | null;
  previousWeightKg?: number | null;
  previousReps?: number | null;
}

export interface ExercisePR extends AuditFields {
  id: ID;
  userId: ID;
  exerciseId: ID;
  workoutSetId?: ID | null;
  prType: 'max_weight' | 'max_reps' | 'max_volume' | 'estimated_1rm';
  value: number;
  achievedAt: string;
}

export interface BodyWeightLog extends AuditFields {
  id: ID;
  userId: ID;
  loggedOn: string;
  weightKg: number;
  notes?: string | null;
}

export interface FoodItem {
  id: ID;
  userId?: ID | null;
  brandId?: ID | null;
  brandName?: string | null;
  name: string;
  servingSize: number;
  servingUnit: string;
  gramsPerServing: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  saturatedFatG?: number | null;
  sodiumMg?: number | null;
  barcode?: string | null;
  sourceProvider: 'seed' | 'custom' | 'barcode' | 'search' | 'oda_private_snapshot';
  isVerified: boolean;
  isCustom: boolean;
}

export interface DiaryDay extends AuditFields {
  id: ID;
  userId: ID;
  localDate: string;
  notes?: string | null;
  entries: DiaryEntry[];
  waterMl: number;
}

export interface DiaryEntry extends AuditFields {
  id: ID;
  userId: ID;
  diaryDayId: ID;
  mealSlot: MealSlot;
  foodItemId: ID;
  food?: FoodItem;
  servings: number;
  quantityType?: 'portion' | 'gram';
  totalGrams?: number;
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
  loggedAt: string;
  foodNameSnapshot: string;
  caloriesSnapshot: number;
  proteinGSnapshot: number;
  carbsGSnapshot: number;
  fatGSnapshot: number;
  fiberGSnapshot?: number | null;
  sodiumMgSnapshot?: number | null;
}

export interface SavedMeal extends AuditFields {
  id: ID;
  userId: ID;
  name: string;
  notes?: string | null;
  isFavorite: boolean;
  items: SavedMealItem[];
}

export interface SavedMealItem extends AuditFields {
  id: ID;
  savedMealId: ID;
  foodItemId: ID;
  servings: number;
  mealSlot?: MealSlot | null;
}

export interface Recipe extends AuditFields {
  id: ID;
  userId: ID;
  name: string;
  servingCount: number;
  instructions?: string | null;
  isFavorite: boolean;
  ingredients: RecipeIngredient[];
}

export interface RecipeIngredient extends AuditFields {
  id: ID;
  recipeId: ID;
  foodItemId: ID;
  servings: number;
  grams?: number | null;
}

export interface WaterLog extends AuditFields {
  id: ID;
  userId: ID;
  localDate: string;
  amountMl: number;
  loggedAt: string;
}

export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
}

export interface DashboardSummary {
  userDisplayName?: string | null;
  profile: UserProfile;
  settings: UserSettings;
  units: UnitPreferences;
  goals: GoalSettings;
  today: {
    localDate: string;
    nutrition: NutritionTotals;
    waterMl: number;
    workoutStatus: WorkoutStatus | 'none';
  };
  weekly: {
    workoutsCompleted: number;
    averageCalories: number;
    averageProteinG: number;
  };
  todayPlan?: {
    id: ID;
    routineId: ID;
    workoutName: string;
    time: string | null;
    exerciseCount: number;
    estimatedDurationMinutes: number;
    action: 'start' | 'view_workout' | 'view_summary';
    sessionId?: ID;
  } | null;
  latestWeight?: BodyWeightLog | null;
  insight?: string;
}
