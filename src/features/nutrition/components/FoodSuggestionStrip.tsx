import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { FoodSuggestion } from '@/data/repositories/nutritionRepository';
import { FoodItem } from '@/domain/models';
import { useAppTheme } from '@/theme/theme';

interface FoodSuggestionStripProps {
  suggestions: FoodSuggestion[];
  onSelect: (food: FoodItem) => void;
  onLongPress?: (food: FoodItem) => void;
}

const MEAL_LABELS = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snacks: 'snacks',
} as const;

function suggestionLabel(suggestion: FoodSuggestion): string {
  return `Often eaten at ${MEAL_LABELS[suggestion.commonMealSlot]}`;
}

export function FoodSuggestionStrip({ suggestions, onSelect, onLongPress }: FoodSuggestionStripProps) {
  const theme = useAppTheme();
  if (!suggestions.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText variant="section">Frequently logged</AppText>
        <AppText muted variant="small">
          Smart picks
        </AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroller}>
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion.food.id}
            accessibilityRole="button"
            onLongPress={() => onLongPress?.(suggestion.food)}
            onPress={() => onSelect(suggestion.food)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: pressed ? 'rgba(53,199,122,0.14)' : 'rgba(31,39,48,0.58)',
                borderColor: pressed ? theme.colors.primary : 'rgba(255,255,255,0.05)',
              },
            ]}
          >
            <AppText weight="800" numberOfLines={1} style={styles.foodName}>
              {suggestion.food.name}
            </AppText>
            <AppText muted variant="small" numberOfLines={1}>
              {suggestionLabel(suggestion)}
            </AppText>
            <AppText weight="800" variant="small" style={{ color: theme.colors.primary }}>
              {suggestion.totalLogs} logs
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scroller: {
    gap: 10,
    paddingRight: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
    minHeight: 84,
    padding: 12,
    width: 176,
  },
  foodName: {
    fontSize: 15,
    lineHeight: 19,
  },
});
