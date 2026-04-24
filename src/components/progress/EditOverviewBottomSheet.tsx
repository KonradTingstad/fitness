import { Check, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import {
  MAX_PROGRESS_OVERVIEW_MODULES,
  PROGRESS_OVERVIEW_METRIC_CATALOG,
} from '@/features/progress/widgets/overviewCatalog';
import { ProgressOverviewMetric } from '@/features/progress/widgets/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  selectedMetrics: ProgressOverviewMetric[];
  onClose: () => void;
  onSave: (metrics: ProgressOverviewMetric[]) => void;
}

export function EditOverviewBottomSheet({ visible, selectedMetrics, onClose, onSave }: Props) {
  const theme = useAppTheme();
  const [draft, setDraft] = useState<ProgressOverviewMetric[]>(selectedMetrics);

  useEffect(() => {
    if (!visible) return;
    setDraft(selectedMetrics);
  }, [selectedMetrics, visible]);

  const canAddMore = draft.length < MAX_PROGRESS_OVERVIEW_MODULES;
  const helperText = useMemo(() => {
    const used = `${draft.length}/${MAX_PROGRESS_OVERVIEW_MODULES}`;
    return canAddMore ? `${used} selected` : `${used} selected • remove one to add another`;
  }, [canAddMore, draft.length]);

  const toggleMetric = (metric: ProgressOverviewMetric) => {
    if (draft.includes(metric)) {
      setDraft((current) => current.filter((item) => item !== metric));
      return;
    }
    if (!canAddMore) return;
    setDraft((current) => [...current, metric]);
  };

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

          <View style={styles.headerRow}>
            <AppText variant="section">Edit overview</AppText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={16} color={theme.colors.muted} />
            </Pressable>
          </View>

          <AppText muted>Select up to {MAX_PROGRESS_OVERVIEW_MODULES} statistics.</AppText>
          <AppText muted variant="small">
            {helperText}
          </AppText>

          <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {PROGRESS_OVERVIEW_METRIC_CATALOG.map((option) => {
              const selected = draft.includes(option.metric);
              const disabled = !selected && !canAddMore;
              return (
                <Pressable
                  key={option.metric}
                  onPress={() => toggleMetric(option.metric)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.surfaceAlt : theme.colors.surface,
                      opacity: disabled ? 0.5 : pressed ? 0.84 : 1,
                    },
                  ]}
                >
                  <View style={styles.copy}>
                    <AppText weight="800">{option.title}</AppText>
                    <AppText muted variant="small">
                      {option.description}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.indicator,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {selected ? <Check size={14} color="#08100C" /> : <Plus size={14} color={theme.colors.muted} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
              ]}
            >
              <AppText weight="700">Cancel</AppText>
            </Pressable>
            <Pressable
              disabled={!draft.length}
              onPress={() => onSave(draft)}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.colors.primary,
                  borderColor: theme.colors.primary,
                  opacity: !draft.length ? 0.45 : pressed ? 0.84 : 1,
                },
              ]}
            >
              <AppText weight="800" style={{ color: '#08100C' }}>
                Save
              </AppText>
            </Pressable>
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  listScroll: {
    maxHeight: 320,
  },
  listContent: {
    gap: 8,
  },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 12,
  },
  copy: {
    flex: 1,
    gap: 1,
    paddingRight: 10,
  },
  indicator: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
