import { Activity, ChevronRight, Dumbbell, Heart, Soup } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ProgressWidgetCategory } from '@/features/progress/widgets/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (category: ProgressWidgetCategory) => void;
}

const OPTIONS: Array<{ category: ProgressWidgetCategory; title: string; subtitle: string; icon: typeof Heart }> = [
  { category: 'body', title: 'Body', subtitle: 'Weight, measurements, photos.', icon: Heart },
  { category: 'nutrition', title: 'Nutrition', subtitle: 'Calories, protein, macros.', icon: Soup },
  { category: 'training', title: 'Training', subtitle: 'Volume, sessions, duration.', icon: Dumbbell },
  { category: 'exercise', title: 'Exercise', subtitle: 'Specific exercise progression.', icon: Activity },
];

export function AddStatBottomSheet({ visible, onClose, onSelect }: Props) {
  const theme = useAppTheme();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
          <AppText variant="section">Add statistic</AppText>
          <View style={styles.list}>
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <Pressable
                  key={option.category}
                  onPress={() => onSelect(option.category)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.84 : 1 },
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <Icon size={18} color={theme.colors.primary} />
                    <View style={styles.copy}>
                      <AppText weight="800">{option.title}</AppText>
                      <AppText muted>{option.subtitle}</AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color={theme.colors.muted} />
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  handle: {
    borderRadius: 99,
    height: 4,
    width: 44,
  },
  list: {
    gap: 8,
  },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 12,
  },
  rowLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 10,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
