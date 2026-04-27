import { Delete, ArrowRight, Gauge } from 'lucide-react-native';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

type KeyboardField = 'weightKg' | 'reps';

interface Props {
  visible: boolean;
  activeField: KeyboardField | null;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onStep: (delta: number) => void;
  onDecimal: () => void;
  onRpeShortcut: () => void;
  onNext: () => void;
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function WorkoutKeyboard({
  visible,
  activeField,
  onDigit,
  onBackspace,
  onStep,
  onDecimal,
  onRpeShortcut,
  onNext,
}: Props) {
  const theme = useAppTheme();

  if (!visible || !activeField) {
    return null;
  }

  return (
    <View style={[styles.container, { borderColor: theme.colors.border, backgroundColor: 'rgba(22,28,35,0.98)' }]}>
      <View style={styles.topRow}>
        <ActionKey label="-" onPress={() => onStep(-1)} />
        <ActionKey label="+" onPress={() => onStep(1)} />
        <ActionKey label="." onPress={onDecimal} />
        <ActionKey
          icon={<Delete size={18} color={theme.colors.text} />}
          onPress={onBackspace}
          style={{ borderColor: theme.colors.border }}
        />
      </View>

      {DIGIT_ROWS.map((row) => (
        <View key={row.join('-')} style={styles.numberRow}>
          {row.map((digit) => (
            <NumberKey key={digit} label={digit} onPress={() => onDigit(digit)} />
          ))}
        </View>
      ))}

      <View style={styles.bottomRow}>
        <ActionKey label="0" onPress={() => onDigit('0')} style={styles.zeroKey} />
        <ActionKey
          icon={<Gauge size={16} color={theme.colors.text} />}
          label="RPE"
          onPress={onRpeShortcut}
          style={{ borderColor: theme.colors.border }}
        />
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.nextKey,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <AppText weight="800" style={{ color: '#08100C' }}>
            Next
          </AppText>
          <ArrowRight size={16} color="#08100C" />
        </Pressable>
      </View>
    </View>
  );
}

function NumberKey({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.numberKey,
        { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <AppText weight="800">{label}</AppText>
    </Pressable>
  );
}

function ActionKey({
  label,
  onPress,
  icon,
  style,
}: {
  label?: string;
  onPress: () => void;
  icon?: ReactNode;
  style?: object;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionKey,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
        style,
      ]}
    >
      {icon}
      {label ? <AppText weight="700">{label}</AppText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionKey: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  numberKey: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  zeroKey: {
    flex: 1.5,
  },
  nextKey: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1.35,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
});
