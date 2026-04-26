import { NavigatorScreenParams } from '@react-navigation/native';

import { MealSlot } from '@/domain/models';
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
  WorkoutSummary: { sessionId: string };
  ExerciseHistory: { exerciseId: string };
  FoodSearch: { mealSlot: MealSlot; localDate: string };
  CustomFood: { mealSlot: MealSlot; localDate: string };
  BarcodeScanner: { mealSlot: MealSlot; localDate: string };
  ProgressStatSelection: { category?: ProgressWidgetCategory } | undefined;
  ProgressStatConfig: { metricId: ProgressWidgetMetric; widgetId?: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
