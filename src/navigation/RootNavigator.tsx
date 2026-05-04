import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Home, LineChart, Soup } from 'lucide-react-native';
import { Platform, StyleSheet, useWindowDimensions, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { OnboardingScreen } from '@/features/auth/screens/OnboardingScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { BarcodeScannerScreen } from '@/features/nutrition/screens/BarcodeScannerScreen';
import { CreateMealScreen } from '@/features/nutrition/screens/CreateMealScreen';
import { CustomFoodScreen } from '@/features/nutrition/screens/CustomFoodScreen';
import { FoodEntryDetailsScreen } from '@/features/nutrition/screens/FoodEntryDetailsScreen';
import { FoodSearchScreen } from '@/features/nutrition/screens/FoodSearchScreen';
import { NutritionDiaryScreen } from '@/features/nutrition/screens/NutritionDiaryScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ProgressStatConfigScreen } from '@/features/progress/screens/ProgressStatConfigScreen';
import { ProgressStatSelectionScreen } from '@/features/progress/screens/ProgressStatSelectionScreen';
import { ProgressScreen } from '@/features/progress/screens/ProgressScreen';
import { ActiveWorkoutOverlay } from '@/features/workouts/components/live/ActiveWorkoutOverlay';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { EditProgramScreen } from '@/features/workouts/screens/EditProgramScreen';
import { ExerciseHistoryScreen } from '@/features/workouts/screens/ExerciseHistoryScreen';
import { LiveWorkoutScreen } from '@/features/workouts/screens/LiveWorkoutScreen';
import { TemplateBuilderScreen } from '@/features/workouts/screens/TemplateBuilderScreen';
import { WorkoutDashboardScreen } from '@/features/workouts/screens/WorkoutDashboardScreen';
import { WorkoutSummaryScreen } from '@/features/workouts/screens/WorkoutSummaryScreen';
import { FLOATING_TAB_BAR_HEIGHT, getFloatingTabBarBottomOffset, getFloatingTabBarHorizontalInset } from '@/navigation/tabBarMetrics';
import { BottomTabParamList, RootStackParamList } from '@/navigation/types';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const NativeTabs = createNativeBottomTabNavigator<BottomTabParamList>();
const BottomTabs = createBottomTabNavigator<BottomTabParamList>();
const IOS_TRANSPARENT_TAB_STYLE = { backgroundColor: 'transparent' } as const;
const ANDROID_TAB_STYLE = { backgroundColor: 'rgba(18,22,27,0.96)' } as const;

function hasViewManager(name: string): boolean {
  try {
    return Boolean(UIManager.getViewManagerConfig?.(name));
  } catch {
    return false;
  }
}

function supportsNativeLiquidTabs(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }
  // Native bottom tabs need all three managers; missing any leads to runtime "Unimplemented component" crashes.
  return hasViewManager('RNSBottomTabs') && hasViewManager('RNSSafeAreaView') && hasViewManager('RNSScreenContentWrapper');
}

function nativeTabIconForRoute(routeName: keyof BottomTabParamList) {
  return ({ focused }: { focused: boolean }) => {
    if (routeName === 'Home') return { type: 'sfSymbol', name: focused ? 'house.fill' : 'house' } as const;
    if (routeName === 'Workouts') return { type: 'sfSymbol', name: focused ? 'figure.run.circle.fill' : 'figure.run' } as const;
    if (routeName === 'Nutrition') return { type: 'sfSymbol', name: focused ? 'fork.knife.circle.fill' : 'fork.knife' } as const;
    return { type: 'sfSymbol', name: focused ? 'chart.bar.fill' : 'chart.bar' } as const;
  };
}

function renderLegacyTabIcon(routeName: keyof BottomTabParamList, color: string, size: number) {
  const iconSize = Math.min(size - 3, 22);
  if (routeName === 'Home') return <Home size={iconSize} color={color} />;
  if (routeName === 'Workouts') return <Dumbbell size={iconSize} color={color} />;
  if (routeName === 'Nutrition') return <Soup size={iconSize} color={color} />;
  return <LineChart size={iconSize} color={color} />;
}

function MainTabs() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const workoutExpanded = useLiveWorkoutOverlayStore((state) => state.expanded);
  const floatingBottom = getFloatingTabBarBottomOffset(insets.bottom);
  const tabBarHorizontalInset = getFloatingTabBarHorizontalInset(screenWidth);
  const useNativeTabs = supportsNativeLiquidTabs();

  return (
    <View style={styles.tabsRoot}>
      {useNativeTabs ? (
        <NativeTabs.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarControllerMode: 'auto',
            tabBarMinimizeBehavior: 'onScrollDown',
            tabBarBlurEffect: 'systemMaterial',
            tabBarStyle: workoutExpanded ? ({ display: 'none' } as const) : IOS_TRANSPARENT_TAB_STYLE,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarIcon: nativeTabIconForRoute(route.name),
          })}
        >
          <NativeTabs.Screen name="Home" component={HomeScreen} />
          <NativeTabs.Screen name="Workouts" component={WorkoutDashboardScreen} />
          <NativeTabs.Screen name="Nutrition" component={NutritionDiaryScreen} />
          <NativeTabs.Screen name="Progress" component={ProgressScreen} />
        </NativeTabs.Navigator>
      ) : (
        <BottomTabs.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle:
              Platform.OS === 'ios'
                ? ({
                    display: workoutExpanded ? 'none' : 'flex',
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    borderTopWidth: 0,
                    borderWidth: 0,
                    borderRadius: 18,
                    height: FLOATING_TAB_BAR_HEIGHT,
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
                  } as const)
                : (workoutExpanded ? ({ display: 'none' } as const) : ANDROID_TAB_STYLE),
            tabBarBackground:
              Platform.OS === 'ios'
                ? () => (
                    <BlurView pointerEvents="none" intensity={60} tint="dark" style={styles.tabBarGlass}>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0.03)']}
                        locations={[0, 0.58, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                      <View pointerEvents="none" style={styles.tabBarInnerGlow} />
                    </BlurView>
                  )
                : undefined,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: Platform.OS === 'ios' ? 'rgba(230,236,245,0.78)' : theme.colors.muted,
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '700',
            },
            tabBarItemStyle: Platform.OS === 'ios' ? ({ flex: 1, paddingVertical: 0 } as const) : undefined,
            tabBarIcon: ({ color, size }) => renderLegacyTabIcon(route.name, color, size),
          })}
        >
          <BottomTabs.Screen name="Home" component={HomeScreen} />
          <BottomTabs.Screen name="Workouts" component={WorkoutDashboardScreen} />
          <BottomTabs.Screen name="Nutrition" component={NutritionDiaryScreen} />
          <BottomTabs.Screen name="Progress" component={ProgressScreen} />
        </BottomTabs.Navigator>
      )}
      <ActiveWorkoutOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRoot: {
    flex: 1,
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,22,29,0.34)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabBarInnerGlow: {
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 3,
    left: 3,
    position: 'absolute',
    right: 3,
    top: 3,
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
      card: Platform.OS === 'ios' ? 'transparent' : theme.colors.surface,
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
            <Stack.Screen name="TemplateBuilder" component={TemplateBuilderScreen} options={{ headerShown: false }} />
            <Stack.Screen name="EditProgram" component={EditProgramScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FoodSearch" component={FoodSearchScreen} options={{ title: 'Add Food' }} />
            <Stack.Screen name="FoodEntryDetails" component={FoodEntryDetailsScreen} options={{ title: 'Food Details' }} />
            <Stack.Screen name="CreateMeal" component={CreateMealScreen} options={{ headerShown: false }} />
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
