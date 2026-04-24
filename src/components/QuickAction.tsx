import { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LucideProps } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useAppTheme } from '@/theme/theme';

interface Props {
  label: string;
  detail?: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
}

export function QuickAction({ label, detail, icon: Icon, onPress }: Props) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon size={17} color={theme.colors.primary} strokeWidth={2.5} />
      </View>
      <View style={styles.copy}>
        <AppText weight="800">{label}</AppText>
        {detail ? (
          <AppText variant="small" muted numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    padding: 10,
    width: '48%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
