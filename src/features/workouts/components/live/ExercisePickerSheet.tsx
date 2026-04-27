import { X, Plus, Check } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Exercise } from '@/domain/models';
import { useAppTheme } from '@/theme/theme';

interface Props {
  visible: boolean;
  exercises: Exercise[];
  selectedIds: Set<string>;
  onToggleSelection: (exerciseId: string) => void;
  onClose: () => void;
  onAddSelected: () => void;
  previousPerformanceByExerciseId: Record<string, string | undefined>;
}

interface ExerciseSection {
  title: string;
  data: Exercise[];
}

type FilterMenu = 'bodyPart' | 'category' | null;

export function ExercisePickerSheet({
  visible,
  exercises,
  selectedIds,
  onToggleSelection,
  onClose,
  onAddSelected,
  previousPerformanceByExerciseId,
}: Props) {
  const theme = useAppTheme();
  const sectionListRef = useRef<SectionList<Exercise, ExerciseSection>>(null);
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState('Any Body Part');
  const [category, setCategory] = useState('Any Category');
  const [sortDirection] = useState<'asc'>('asc');
  const [filterMenu, setFilterMenu] = useState<FilterMenu>(null);

  const bodyPartOptions = useMemo(() => {
    const values = new Set<string>();
    for (const exercise of exercises) {
      if (exercise.primaryMuscle.trim()) {
        values.add(toTitleCase(exercise.primaryMuscle.trim()));
      }
    }
    return ['Any Body Part', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [exercises]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const exercise of exercises) {
      if (exercise.equipment.trim()) {
        values.add(toTitleCase(exercise.equipment.trim()));
      }
    }
    return ['Any Category', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return exercises
      .filter((exercise) => {
        const name = exercise.name.toLocaleLowerCase();
        const muscle = exercise.primaryMuscle.toLocaleLowerCase();
        const equipment = exercise.equipment.toLocaleLowerCase();
        const matchesQuery = !normalizedQuery || name.includes(normalizedQuery) || muscle.includes(normalizedQuery) || equipment.includes(normalizedQuery);
        const matchesBodyPart = bodyPart === 'Any Body Part' || toTitleCase(exercise.primaryMuscle) === bodyPart;
        const matchesCategory = category === 'Any Category' || toTitleCase(exercise.equipment) === category;
        return matchesQuery && matchesBodyPart && matchesCategory;
      })
      .sort((a, b) => (sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
  }, [bodyPart, category, exercises, query, sortDirection]);

  const sections = useMemo<ExerciseSection[]>(() => {
    const grouped = new Map<string, Exercise[]>();
    for (const exercise of filteredExercises) {
      const first = exercise.name.trim().charAt(0).toUpperCase() || '#';
      if (!grouped.has(first)) {
        grouped.set(first, []);
      }
      grouped.get(first)?.push(exercise);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([title, data]) => ({ title, data }));
  }, [filteredExercises]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { borderColor: theme.colors.border, backgroundColor: 'rgba(15,21,28,0.99)' }]}>
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        </View>

        <View style={styles.headerRow}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.headerIcon, { borderColor: theme.colors.border, opacity: pressed ? 0.82 : 1 }]}>
            <X size={16} color={theme.colors.text} />
          </Pressable>
          <AppText variant="section">Add exercises</AppText>
          <Pressable
            onPress={onAddSelected}
            disabled={!selectedIds.size}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: theme.colors.primary,
                opacity: !selectedIds.size ? 0.45 : pressed ? 0.82 : 1,
              },
            ]}
          >
            <AppText weight="800" style={{ color: '#08100C' }}>
              Add
            </AppText>
          </Pressable>
        </View>

        <View style={[styles.searchWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={theme.colors.muted}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
        </View>

        <View style={styles.pillRow}>
          <FilterPill label={bodyPart} onPress={() => setFilterMenu('bodyPart')} />
          <FilterPill label={category} onPress={() => setFilterMenu('category')} />
          <FilterPill label="Sort: A → Z" onPress={() => undefined} />
        </View>

        <View style={styles.listShell}>
          <SectionList
            ref={sectionListRef}
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled
            keyboardShouldPersistTaps="handled"
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: 'rgba(13,17,22,0.94)' }]}>
                <AppText muted weight="700">
                  {section.title}
                </AppText>
              </View>
            )}
            renderItem={({ item }) => {
              const selected = selectedIds.has(item.id);
              const previous = previousPerformanceByExerciseId[item.id];
              return (
                <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
                  <View style={[styles.iconWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <AppText weight="800">{item.name.slice(0, 1).toUpperCase()}</AppText>
                  </View>
                  <View style={styles.rowCopy}>
                    <AppText weight="700">{item.name}</AppText>
                    <AppText muted variant="small">
                      {toTitleCase(item.primaryMuscle)} • {toTitleCase(item.equipment)}
                    </AppText>
                    {previous ? (
                      <AppText variant="small" style={{ color: theme.colors.primary }}>
                        {previous}
                      </AppText>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => onToggleSelection(item.id)}
                    style={({ pressed }) => [
                      styles.rowAdd,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? 'rgba(53,199,122,0.2)' : theme.colors.surfaceAlt,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {selected ? <Check size={17} color={theme.colors.primary} /> : <Plus size={17} color={theme.colors.text} />}
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <AppText weight="700">No exercises found</AppText>
                <AppText muted variant="small">
                  Adjust search or filters.
                </AppText>
              </View>
            }
          />

          <View style={styles.alphabetRail}>
            {sections.map((section, sectionIndex) => (
              <Pressable
                key={section.title}
                onPress={() =>
                  sectionListRef.current?.scrollToLocation({
                    sectionIndex,
                    itemIndex: 0,
                    animated: true,
                  })
                }
                style={({ pressed }) => [styles.letterButton, pressed && { opacity: 0.8 }]}
              >
                <AppText variant="small" style={{ color: theme.colors.muted }}>
                  {section.title}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {filterMenu ? (
        <View style={styles.filterMenuLayer} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={() => setFilterMenu(null)} />
          <View style={[styles.filterMenu, { borderColor: theme.colors.border, backgroundColor: 'rgba(22,27,34,0.98)' }]}>
            {(filterMenu === 'bodyPart' ? bodyPartOptions : categoryOptions).map((option) => {
              const active = filterMenu === 'bodyPart' ? option === bodyPart : option === category;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (filterMenu === 'bodyPart') {
                      setBodyPart(option);
                    } else {
                      setCategory(option);
                    }
                    setFilterMenu(null);
                  }}
                  style={({ pressed }) => [
                    styles.filterOption,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? 'rgba(53,199,122,0.16)' : theme.colors.surfaceAlt,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.text }}>
                    {option}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function FilterPill({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <AppText variant="small" numberOfLines={1} style={{ color: theme.colors.muted }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 32,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,9,12,0.46)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '86%',
    minHeight: '72%',
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  handle: {
    borderRadius: 999,
    height: 4,
    width: 46,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 62,
    paddingHorizontal: 12,
  },
  searchWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  searchInput: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 42,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  pill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  listShell: {
    flex: 1,
  },
  sectionHeader: {
    paddingBottom: 4,
    paddingTop: 8,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 66,
    paddingRight: 28,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowAdd: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  emptyList: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 30,
  },
  alphabetRail: {
    alignItems: 'center',
    position: 'absolute',
    right: 0,
    top: 10,
  },
  letterButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  filterMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 38,
  },
  filterMenu: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    maxHeight: '45%',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  filterOption: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
