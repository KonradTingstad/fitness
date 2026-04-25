import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';

interface FoodMacroChipsProps {
  protein: number;
  carbs: number;
  fat: number;
}

const MACROS = [
  { key: 'protein', label: 'P', color: '#35C77A', tint: 'rgba(53,199,122,0.12)' },
  { key: 'carbs', label: 'C', color: '#379CFF', tint: 'rgba(55,156,255,0.12)' },
  { key: 'fat', label: 'F', color: '#F4B740', tint: 'rgba(244,183,64,0.13)' },
] as const;

function rounded(value: number): number {
  return Math.round(value);
}

export function FoodMacroChips({ protein, carbs, fat }: FoodMacroChipsProps) {
  const values = { protein, carbs, fat };

  return (
    <View style={styles.row}>
      {MACROS.map((macro) => (
        <View key={macro.key} style={[styles.chip, { backgroundColor: macro.tint }]}>
          <AppText weight="800" variant="small" style={{ color: macro.color }}>
            {macro.label}
          </AppText>
          <AppText weight="800" variant="small">
            {rounded(values[macro.key])}g
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minHeight: 27,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
});
