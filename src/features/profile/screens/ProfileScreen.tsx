import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, RefreshCw, Shield, Trash2 } from 'lucide-react-native';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StatPill } from '@/components/StatPill';
import { updateGoals } from '@/data/repositories/settingsRepository';
import { runBackgroundSync } from '@/data/sync/syncService';
import { queryKeys } from '@/hooks/queryKeys';
import { useProfileBundle } from '@/hooks/useAppQueries';
import { signOut } from '@/services/auth/authService';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

export function ProfileScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const profile = useProfileBundle();
  const setUserId = useAppStore((state) => state.setUserId);
  const setComplete = useAppStore((state) => state.setOnboardingComplete);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');

  const saveGoals = useMutation({
    mutationFn: () =>
      updateGoals({
        calorieTarget: calories ? Number(calories) : undefined,
        proteinTargetG: protein ? Number(protein) : undefined,
      }),
    onSuccess: () => {
      setCalories('');
      setProtein('');
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });

  const sync = useMutation({
    mutationFn: runBackgroundSync,
    onSuccess: (state) => {
      if (!state.isConfigured) {
        Alert.alert('Sync', 'Supabase is not configured. Changes are still safe locally.');
        return;
      }
      if (state.skippedReason === 'offline') {
        Alert.alert('Sync paused', 'You appear to be offline. Changes are still stored locally.');
        return;
      }
      if (state.skippedReason === 'not_authenticated') {
        if (state.isAuthenticated) {
          Alert.alert('Sync auth failed', state.lastError ?? 'Supabase rejected the session for Edge Functions.');
          return;
        }
        Alert.alert('Sync requires sign-in', 'You are using local mode. Sign in with a Supabase account to sync to cloud.');
        return;
      }
      if (state.failedCount > 0) {
        Alert.alert('Sync failed', `${state.failedCount} item(s) failed. ${state.lastError ?? 'Check logs for details.'}`);
        return;
      }
      Alert.alert('Sync', state.pendingCount === 0 ? 'All changes are synced.' : `${state.pendingCount} pending changes remain.`);
    },
  });

  if (profile.isLoading || !profile.data) {
    return <LoadingState label="Loading profile" />;
  }

  const logout = async () => {
    await signOut();
    setUserId(null);
    setComplete(false);
  };

  return (
    <Screen>
      <View>
        <AppText variant="title">Profile</AppText>
        <AppText muted>Goals, units, privacy, and sync.</AppText>
      </View>

      <Card>
        <AppText variant="section">Demo Athlete</AppText>
        <View style={styles.grid}>
          <StatPill label="Height" value={`${profile.data.profile.heightCm} cm`} />
          <StatPill label="Weight" value={`${profile.data.profile.currentWeightKg} kg`} />
        </View>
        <View style={styles.grid}>
          <StatPill label="Goal" value={profile.data.goals.goal} tone="good" />
          <StatPill label="Activity" value={profile.data.goals.activityLevel} tone="info" />
        </View>
      </Card>

      <Card>
        <AppText variant="section">Targets</AppText>
        <GoalInput label="Calories" value={calories} onChangeText={setCalories} placeholder={`${profile.data.goals.calorieTarget}`} />
        <GoalInput label="Protein" value={protein} onChangeText={setProtein} placeholder={`${profile.data.goals.proteinTargetG}`} />
        <Button label="Save targets" onPress={() => saveGoals.mutate()} />
      </Card>

      <Card>
        <AppText variant="section">Units</AppText>
        <View style={styles.grid}>
          <StatPill label="Body" value={profile.data.units.bodyWeightUnit} />
          <StatPill label="Load" value={profile.data.units.loadUnit} />
          <StatPill label="Volume" value={profile.data.units.volumeUnit} />
        </View>
      </Card>

      <Card>
        <View style={styles.titleRow}>
          <AppText variant="section">Privacy and data</AppText>
          <Shield color={theme.colors.primary} size={20} />
        </View>
        <AppText muted>Core logs are local-first. Supabase sync is only used when environment values and Edge Functions are configured.</AppText>
        <View style={styles.grid}>
          <Button label="Sync now" icon={RefreshCw} variant="secondary" onPress={() => sync.mutate()} style={styles.flex} />
          <Button label="Export" icon={Download} variant="secondary" onPress={() => Alert.alert('Export', 'CSV export is reserved for the next implementation slice.')} style={styles.flex} />
        </View>
        <Button label="Delete data" icon={Trash2} variant="danger" onPress={() => Alert.alert('Delete data', 'Account deletion should call Supabase and wipe local SQLite in the production backend slice.')} />
      </Card>

      <Button label="Sign out" icon={LogOut} variant="ghost" onPress={logout} />
    </Screen>
  );
}

function GoalInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.inputWrap}>
      <AppText variant="small" muted>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  inputWrap: {
    gap: 6,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
  },
});
