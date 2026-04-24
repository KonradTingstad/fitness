import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Dumbbell, Home, LineChart, Settings, Soup } from 'lucide-react-native';

import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { OnboardingScreen } from '@/features/auth/screens/OnboardingScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { BarcodeScannerScreen } from '@/features/nutrition/screens/BarcodeScannerScreen';
import { CustomFoodScreen } from '@/features/nutrition/screens/CustomFoodScreen';
import { FoodSearchScreen } from '@/features/nutrition/screens/FoodSearchScreen';
import { NutritionDiaryScreen } from '@/features/nutrition/screens/NutritionDiaryScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ProgressStatConfigScreen } from '@/features/progress/screens/ProgressStatConfigScreen';
import { ProgressStatSelectionScreen } from '@/features/progress/screens/ProgressStatSelectionScreen';
import { ProgressScreen } from '@/features/progress/screens/ProgressScreen';
import { ExerciseHistoryScreen } from '@/features/workouts/screens/ExerciseHistoryScreen';
import { LiveWorkoutScreen } from '@/features/workouts/screens/LiveWorkoutScreen';
import { WorkoutDashboardScreen } from '@/features/workouts/screens/WorkoutDashboardScreen';
import { WorkoutSummaryScreen } from '@/features/workouts/screens/WorkoutSummaryScreen';
import { BottomTabParamList, RootStackParamList } from '@/navigation/types';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<BottomTabParamList>();

function MainTabs() {
  const theme = useAppTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 78,
          paddingBottom: 18,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size }) => {
          const iconSize = size - 1;
          if (route.name === 'Home') return <Home size={iconSize} color={color} />;
          if (route.name === 'Workouts') return <Dumbbell size={iconSize} color={color} />;
          if (route.name === 'Nutrition') return <Soup size={iconSize} color={color} />;
          if (route.name === 'Progress') return <LineChart size={iconSize} color={color} />;
          return <Settings size={iconSize} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Workouts" component={WorkoutDashboardScreen} />
      <Tabs.Screen name="Nutrition" component={NutritionDiaryScreen} />
      <Tabs.Screen name="Progress" component={ProgressScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const theme = useAppTheme();
  const userId = useAppStore((state) => state.userId);
  const hasCompletedOnboarding = useAppStore((state) => state.hasCompletedOnboarding);
  const navigationTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {!userId ? (
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        ) : !hasCompletedOnboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="LiveWorkout" component={LiveWorkoutScreen} options={{ title: 'Live Workout' }} />
            <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ title: 'Workout Summary' }} />
            <Stack.Screen name="ExerciseHistory" component={ExerciseHistoryScreen} options={{ title: 'Exercise History' }} />
            <Stack.Screen name="FoodSearch" component={FoodSearchScreen} options={{ title: 'Add Food' }} />
            <Stack.Screen name="CustomFood" component={CustomFoodScreen} options={{ title: 'Custom Food' }} />
            <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} options={{ title: 'Scan Barcode' }} />
            <Stack.Screen name="ProgressStatSelection" component={ProgressStatSelectionScreen} options={{ title: 'Select statistic' }} />
            <Stack.Screen name="ProgressStatConfig" component={ProgressStatConfigScreen} options={{ title: 'Configure statistic' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
