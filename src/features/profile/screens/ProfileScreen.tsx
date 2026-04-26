import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, RefreshCw, Shield, Trash2, User } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { updateGoals, updateProfileSettings, updateUnitPreferences } from '@/data/repositories/settingsRepository';
import { ActivityLevel, VolumeUnit, WeightUnit } from '@/domain/models';
import { queryKeys } from '@/hooks/queryKeys';
import { useProfileBundle } from '@/hooks/useAppQueries';
import { signOut } from '@/services/auth/authService';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';
import { runBackgroundSync } from '@/data/sync/syncService';

const ACTIVITY_LEVEL_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'athlete', label: 'Athlete' },
];

const WEIGHT_UNIT_OPTIONS: Array<{ value: WeightUnit; label: string }> = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

const VOLUME_UNIT_OPTIONS: Array<{ value: VolumeUnit; label: string }> = [
  { value: 'ml', label: 'ml' },
  { value: 'oz', label: 'oz' },
];

function splitDisplayName(displayName?: string | null): { firstName: string; lastName: string } {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(' ') };
}

function parseNumberInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized.length) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function syncStatusText(state?: { pendingCount: number; failedCount: number; skippedReason?: string }): string {
  if (!state) return 'Local-first mode. Use Sync now when cloud sync is configured.';
  if (state.skippedReason === 'not_configured') return 'Supabase sync not configured. Data remains on-device.';
  if (state.skippedReason === 'offline') return 'Offline. Changes are queued locally.';
  if (state.skippedReason === 'not_authenticated') return 'Sign in to Supabase to sync to cloud.';
  if (state.failedCount > 0) return `${state.failedCount} item(s) failed. Try syncing again.`;
  if (state.pendingCount > 0) return `${state.pendingCount} pending change(s) waiting to sync.`;
  return 'All changes are synced.';
}

export function ProfileScreen() {
  const theme = useAppTheme();
  const queryClient = useQueryClient();
  const profile = useProfileBundle();
  const setUserId = useAppStore((state) => state.setUserId);
  const setComplete = useAppStore((state) => state.setOnboardingComplete);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightValue, setWeightValue] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [bodyWeightUnit, setBodyWeightUnit] = useState<WeightUnit>('kg');
  const [loadUnit, setLoadUnit] = useState<WeightUnit>('kg');
  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('ml');

  useEffect(() => {
    if (!profile.data) return;
    const names = splitDisplayName(profile.data.displayName);
    setFirstName(names.firstName);
    setLastName(names.lastName);
    setHeightCm(String(Math.round(profile.data.profile.heightCm)));
    setWeightValue(String(Math.round(profile.data.profile.currentWeightKg * 10) / 10));
    setActivityLevel(profile.data.goals.activityLevel);
    setBodyWeightUnit(profile.data.units.bodyWeightUnit);
    setLoadUnit(profile.data.units.loadUnit);
    setVolumeUnit(profile.data.units.volumeUnit);
  }, [
    profile.data?.displayName,
    profile.data?.profile.heightCm,
    profile.data?.profile.currentWeightKg,
    profile.data?.goals.activityLevel,
    profile.data?.units.bodyWeightUnit,
    profile.data?.units.loadUnit,
    profile.data?.units.volumeUnit,
  ]);

  const saveProfile = useMutation({
    mutationFn: (input: {
      firstName: string;
      lastName: string;
      heightCm: number;
      currentWeightKg: number;
      activityLevel: ActivityLevel;
      bodyWeightUnit: WeightUnit;
      loadUnit: WeightUnit;
      volumeUnit: VolumeUnit;
    }) =>
      Promise.all([
        updateProfileSettings({
          firstName: input.firstName,
          lastName: input.lastName,
          heightCm: input.heightCm,
          currentWeightKg: input.currentWeightKg,
        }),
        updateGoals({ activityLevel: input.activityLevel }),
        updateUnitPreferences({
          bodyWeightUnit: input.bodyWeightUnit,
          loadUnit: input.loadUnit,
          volumeUnit: input.volumeUnit,
        }),
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (error) => {
      Alert.alert('Profile settings', error instanceof Error ? error.message : 'Unable to save profile settings.');
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
    return <LoadingState label="Loading profile settings" />;
  }

  const savedNames = splitDisplayName(profile.data.displayName);
  const parsedHeightCm = parseNumberInput(heightCm);
  const parsedWeight = parseNumberInput(weightValue);

  const dirty = useMemo(
    () =>
      firstName.trim() !== savedNames.firstName ||
      lastName.trim() !== savedNames.lastName ||
      parsedHeightCm !== profile.data.profile.heightCm ||
      parsedWeight !== profile.data.profile.currentWeightKg ||
      activityLevel !== profile.data.goals.activityLevel ||
      bodyWeightUnit !== profile.data.units.bodyWeightUnit ||
      loadUnit !== profile.data.units.loadUnit ||
      volumeUnit !== profile.data.units.volumeUnit,
    [
      firstName,
      lastName,
      savedNames.firstName,
      savedNames.lastName,
      parsedHeightCm,
      parsedWeight,
      profile.data.profile.heightCm,
      profile.data.profile.currentWeightKg,
      activityLevel,
      profile.data.goals.activityLevel,
      bodyWeightUnit,
      profile.data.units.bodyWeightUnit,
      loadUnit,
      profile.data.units.loadUnit,
      volumeUnit,
      profile.data.units.volumeUnit,
    ],
  );

  const saveSettings = () => {
    if (parsedHeightCm === null || parsedWeight === null) {
      Alert.alert('Profile settings', 'Please enter valid height and weight values.');
      return;
    }
    if (parsedHeightCm < 100 || parsedHeightCm > 240) {
      Alert.alert('Profile settings', 'Height should be between 100 and 240 cm.');
      return;
    }
    if (parsedWeight < 35 || parsedWeight > 300) {
      Alert.alert('Profile settings', 'Weight should be between 35 and 300 kg.');
      return;
    }
    saveProfile.mutate({
      firstName,
      lastName,
      heightCm: parsedHeightCm,
      currentWeightKg: parsedWeight,
      activityLevel,
      bodyWeightUnit,
      loadUnit,
      volumeUnit,
    });
  };

  const logout = async () => {
    await signOut();
    setUserId(null);
    setComplete(false);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { borderColor: theme.colors.border }]}>
          <User color={theme.colors.muted} size={22} strokeWidth={2.4} />
        </View>
        <View style={styles.headerCopy}>
          <AppText variant="title">Profile & Settings</AppText>
          <AppText muted>Account details and app configuration.</AppText>
        </View>
      </View>

      <Card style={styles.sectionCard}>
        <AppText variant="section">Personal information</AppText>
        <View style={styles.row}>
          <SettingInput label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
          <SettingInput label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        </View>
        <View style={styles.row}>
          <SettingInput label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
          <SettingInput label="Weight (kg)" value={weightValue} onChangeText={setWeightValue} keyboardType="decimal-pad" />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <AppText variant="section">Activity level</AppText>
        <View style={styles.optionRow}>
          {ACTIVITY_LEVEL_OPTIONS.map((option) => {
            const active = activityLevel === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => setActivityLevel(option.value)}
                style={({ pressed }) => [
                  styles.optionChip,
                  {
                    backgroundColor: active ? 'rgba(53,199,122,0.18)' : theme.colors.surfaceAlt,
                    borderColor: active ? 'rgba(53,199,122,0.5)' : theme.colors.border,
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <AppText weight={active ? '800' : '700'}>{option.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <AppText variant="section">Units</AppText>
        <View style={styles.group}>
          <AppText muted variant="small">
            Body weight unit
          </AppText>
          <View style={styles.optionRow}>
            {WEIGHT_UNIT_OPTIONS.map((option) => {
              const active = bodyWeightUnit === option.value;
              return (
                <UnitChip key={`body-${option.value}`} label={option.label} active={active} onPress={() => setBodyWeightUnit(option.value)} />
              );
            })}
          </View>
        </View>
        <View style={styles.group}>
          <AppText muted variant="small">
            Load unit
          </AppText>
          <View style={styles.optionRow}>
            {WEIGHT_UNIT_OPTIONS.map((option) => {
              const active = loadUnit === option.value;
              return <UnitChip key={`load-${option.value}`} label={option.label} active={active} onPress={() => setLoadUnit(option.value)} />;
            })}
          </View>
        </View>
        <View style={styles.group}>
          <AppText muted variant="small">
            Volume unit
          </AppText>
          <View style={styles.optionRow}>
            {VOLUME_UNIT_OPTIONS.map((option) => {
              const active = volumeUnit === option.value;
              return <UnitChip key={`volume-${option.value}`} label={option.label} active={active} onPress={() => setVolumeUnit(option.value)} />;
            })}
          </View>
        </View>
      </Card>

      <Button
        label={saveProfile.isPending ? 'Saving...' : 'Save profile settings'}
        onPress={saveSettings}
        disabled={saveProfile.isPending || !dirty}
      />

      <Card style={styles.sectionCard}>
        <View style={styles.titleRow}>
          <AppText variant="section">Privacy and data</AppText>
          <Shield color={theme.colors.primary} size={20} />
        </View>
        <AppText muted>Core logs are local-first. Supabase sync is only used when environment values and Edge Functions are configured.</AppText>
        <AppText muted variant="small">
          {sync.isPending ? 'Sync in progress…' : syncStatusText(sync.data)}
        </AppText>
        <View style={styles.row}>
          <Button label="Sync now" icon={RefreshCw} variant="secondary" onPress={() => sync.mutate()} style={styles.flex} />
          <Button label="Export" icon={Download} variant="secondary" onPress={() => Alert.alert('Export', 'CSV export is reserved for the next implementation slice.')} style={styles.flex} />
        </View>
        <Button
          label="Delete data"
          icon={Trash2}
          variant="danger"
          onPress={() => Alert.alert('Delete data', 'Account deletion should call Supabase and wipe local SQLite in the production backend slice.')}
        />
      </Card>

      <Button label="Sign out" icon={LogOut} variant="ghost" onPress={logout} />
    </Screen>
  );
}

function SettingInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.inputWrap}>
      <AppText muted variant="small">
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
      />
    </View>
  );
}

function UnitChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionChip,
        {
          backgroundColor: active ? 'rgba(53,199,122,0.18)' : theme.colors.surfaceAlt,
          borderColor: active ? 'rgba(53,199,122,0.5)' : theme.colors.border,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <AppText weight={active ? '800' : '700'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,26,32,0.72)',
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  sectionCard: {
    gap: 10,
  },
  group: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    gap: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
});
