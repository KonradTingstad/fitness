import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/LoadingState';
import { initializeDatabase } from '@/data/db/database';
import { RootNavigator } from '@/navigation/RootNavigator';
import { restoreAuthState } from '@/services/auth/authService';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

function AppRoot() {
  const theme = useAppTheme();
  const [ready, setReady] = useState(false);
  const setUserId = useAppStore((state) => state.setUserId);
  const setComplete = useAppStore((state) => state.setOnboardingComplete);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      await initializeDatabase();
      const auth = await restoreAuthState();
      if (!mounted) return;
      setUserId(auth.userId);
      setComplete(auth.hasCompletedOnboarding);
      setReady(true);
    }
    boot().catch((error) => {
      console.error(error);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [setComplete, setUserId]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <LoadingState label="Preparing FormFuel" />
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 5 * 60_000,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppRoot />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
