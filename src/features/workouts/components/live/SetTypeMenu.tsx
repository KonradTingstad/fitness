import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { SetType } from '@/domain/models';
import { useAppTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: SetType) => void;
}

const OPTIONS: Array<{ type: SetType; label: string; description: string; accent: 'normal' | 'warmup' | 'drop' | 'failure' }> = [
  { type: 'normal', label: 'Normal set', description: 'Standard working set', accent: 'normal' },
  { type: 'warmup', label: 'Warm up', description: 'Prep set before work sets', accent: 'warmup' },
  { type: 'drop', label: 'Drop set', description: 'Reduce load and continue', accent: 'drop' },
  { type: 'failure', label: 'Failure', description: 'Set taken to failure', accent: 'failure' },
];

export function SetTypeMenu({ visible, onClose, onSelect }: Props) {
  const theme = useAppTheme();

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.menu, { borderColor: theme.colors.border, backgroundColor: 'rgba(19,24,30,0.98)' }]}>
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        </View>
        <AppText variant="section">Set type</AppText>
        {OPTIONS.map((option) => {
          const accentColor =
            option.accent === 'warmup'
              ? theme.colors.warning
              : option.accent === 'drop'
                ? theme.colors.accent
                : option.accent === 'failure'
                  ? theme.colors.danger
                  : theme.colors.text;

          return (
            <Pressable
              key={option.type}
              onPress={() => {
                onSelect(option.type);
                onClose();
              }}
              style={({ pressed }) => [
                styles.option,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: accentColor }]} />
              <View style={styles.optionCopy}>
                <AppText weight="800" style={{ color: accentColor }}>
                  {option.label}
                </AppText>
                <AppText muted variant="small">
                  {option.description}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,12,0.46)',
  },
  menu: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 22,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 2,
    paddingTop: 4,
  },
  handle: {
    borderRadius: 999,
    height: 4,
    width: 46,
  },
  option: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  dot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
});
