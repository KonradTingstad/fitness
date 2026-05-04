import { NavigatorScreenParams } from '@react-navigation/native';

import { FoodItem, FoodItemType, MealSlot } from '@/domain/models';
import { ProgressWidgetCategory, ProgressWidgetMetric } from '@/features/progress/widgets/types';

export type BottomTabParamList = {
  Home: undefined;
  Workouts: undefined;
  Nutrition: undefined;
  Progress: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<BottomTabParamList>;
  ProfileSettings: undefined;
  LiveWorkout: { sessionId: string };
  WorkoutSummary: { sessionId: string; startInEdit?: boolean };
  ExerciseHistory: { exerciseId: string };
  TemplateBuilder: { groupId?: string; groupName?: string; routineId?: string } | undefined;
  EditProgram: { initialLocalDate?: string } | undefined;
  FoodSearch: { mealSlot: MealSlot; localDate: string; mode?: FoodItemType };
  FoodEntryDetails: { mealSlot: MealSlot; localDate: string; food: FoodItem };
  CreateMeal: { localDate?: string; mealSlot?: MealSlot; savedMealId?: string } | undefined;
  CustomFood: { mealSlot: MealSlot; localDate: string; mode?: FoodItemType };
  BarcodeScanner: { mealSlot: MealSlot; localDate: string; mode?: FoodItemType };
  ProgressStatSelection: { category?: ProgressWidgetCategory } | undefined;
  ProgressStatConfig: { metricId: ProgressWidgetMetric; widgetId?: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
