import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { completeOnboarding } from '@/data/repositories/settingsRepository';
import { onboardingSchema } from '@/domain/validation/forms';
import { markOnboardingComplete } from '@/services/auth/authService';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

export function OnboardingScreen() {
  const theme = useAppTheme();
  const setComplete = useAppStore((state) => state.setOnboardingComplete);
  const [heightCm, setHeightCm] = useState('178');
  const [currentWeightKg, setCurrentWeightKg] = useState('82');
  const [calorieTarget, setCalorieTarget] = useState('2550');
  const [proteinTargetG, setProteinTargetG] = useState('165');
  const [workoutsPerWeekTarget, setWorkoutsPerWeekTarget] = useState('4');

  const submit = async () => {
    const parsed = onboardingSchema.safeParse({
      heightCm,
      currentWeightKg,
      calorieTarget,
      proteinTargetG,
      workoutsPerWeekTarget,
    });
    if (!parsed.success) {
      Alert.alert('Check your inputs', parsed.error.issues[0]?.message ?? 'Some values are invalid.');
      return;
    }
    await completeOnboarding(parsed.data);
    await markOnboardingComplete();
    setComplete(true);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Set your baseline</AppText>
        <AppText muted>These targets can be changed anytime. FormFuel stores canonical units locally and displays your preferred units.</AppText>
      </View>
      <Card>
        <Field label="Height" value={heightCm} onChangeText={setHeightCm} suffix="cm" />
        <Field label="Weight" value={currentWeightKg} onChangeText={setCurrentWeightKg} suffix="kg" />
        <Field label="Calories" value={calorieTarget} onChangeText={setCalorieTarget} suffix="kcal" />
        <Field label="Protein" value={proteinTargetG} onChangeText={setProteinTargetG} suffix="g" />
        <Field label="Workout target" value={workoutsPerWeekTarget} onChangeText={setWorkoutsPerWeekTarget} suffix="/ week" />
      </Card>
      <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
        <AppText variant="section">Starting plan</AppText>
        <AppText muted>Maintain weight, moderate activity, metric units, protein-forward nutrition, and a 4 day training week.</AppText>
      </Card>
      <Button label="Create dashboard" onPress={submit} icon={Check} />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.field}>
      <AppText weight="800">{label}</AppText>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
        />
        <AppText muted>{suffix}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
  },
  field: {
    gap: 8,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
  },
});
