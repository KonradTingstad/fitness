import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Home, LineChart, Soup } from 'lucide-react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const floatingBottom = Math.max(insets.bottom - 4, 12);
  const tabBarHorizontalInset = screenWidth < 360 ? 14 : 18;

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarBackground: () => (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(8,12,18,0)', 'rgba(8,12,18,0.28)', 'rgba(8,12,18,0.72)']}
              locations={[0, 0.36, 1]}
              style={[
                styles.tabBarVeil,
                {
                  left: -tabBarHorizontalInset,
                  right: -tabBarHorizontalInset,
                  bottom: -floatingBottom - 4,
                },
              ]}
            />
            <BlurView pointerEvents="none" intensity={48} tint="dark" style={styles.tabBarGlass}>
              <LinearGradient
                colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.06)', 'rgba(8,12,18,0.36)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
            </BlurView>
          </>
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderTopWidth: 0,
          borderWidth: 0,
          borderRadius: 18,
          height: 62,
          paddingBottom: 6,
          paddingTop: 6,
          marginHorizontal: tabBarHorizontalInset,
          position: 'absolute',
          bottom: floatingBottom,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        },
        tabBarItemStyle: {
          flex: 1,
          paddingVertical: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size }) => {
          const iconSize = Math.min(size - 3, 22);
          if (route.name === 'Home') return <Home size={iconSize} color={color} />;
          if (route.name === 'Workouts') return <Dumbbell size={iconSize} color={color} />;
          if (route.name === 'Nutrition') return <Soup size={iconSize} color={color} />;
          return <LineChart size={iconSize} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Workouts" component={WorkoutDashboardScreen} />
      <Tabs.Screen name="Nutrition" component={NutritionDiaryScreen} />
      <Tabs.Screen name="Progress" component={ProgressScreen} />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarVeil: {
    position: 'absolute',
    top: 0,
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,20,24,0.38)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

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
            <Stack.Screen name="ProfileSettings" component={ProfileScreen} options={{ title: 'Profile & Settings' }} />
            <Stack.Screen name="ProgressStatSelection" component={ProgressStatSelectionScreen} options={{ title: 'Select statistic' }} />
            <Stack.Screen name="ProgressStatConfig" component={ProgressStatConfigScreen} options={{ title: 'Configure statistic' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
