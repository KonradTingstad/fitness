import { Alert, type AlertButton } from 'react-native';

import { DiaryEntry, MealSlot } from '@/domain/models';

const MEAL_OPTIONS: Array<{ slot: MealSlot; label: string }> = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'dinner', label: 'Dinner' },
  { slot: 'snacks', label: 'Snacks' },
];

function parseServings(value: string | undefined): number | null {
  const normalized = (value ?? '').trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function askForServings(foodName: string, mealSlot: MealSlot, onSubmit: (mealSlot: MealSlot, servings: number) => void) {
  Alert.prompt(
    'Portion',
    `How many servings of ${foodName}?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        isPreferred: true,
        onPress: (value?: string | { login: string; password: string }) => {
          const servings = parseServings(typeof value === 'string' ? value : undefined);
          if (!servings) {
            Alert.alert('Portion', 'Enter a number greater than 0.');
            return;
          }
          onSubmit(mealSlot, servings);
        },
      },
    ],
    'plain-text',
    '1',
    'decimal-pad',
  );
}

export function resolveLastUsedMealSlot(entries: DiaryEntry[], fallback: MealSlot): MealSlot {
  const latest = [...entries].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())[0];
  return latest?.mealSlot ?? fallback;
}

export function promptForMealAndServings({
  foodName,
  onSubmit,
}: {
  foodName: string;
  onSubmit: (mealSlot: MealSlot, servings: number) => void;
}) {
  const buttons: AlertButton[] = [
    ...MEAL_OPTIONS.map((option) => ({
      text: option.label,
      onPress: () => askForServings(foodName, option.slot, onSubmit),
    })),
    { text: 'Cancel', style: 'cancel' },
  ];

  Alert.alert('Add food', 'Choose meal and portion.', buttons, { cancelable: true });
}
