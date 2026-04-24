import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/theme';

export function AppBackground() {
  const theme = useAppTheme();

  return (
    <View pointerEvents="none" style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <LinearGradient
        colors={[
          'rgba(30,215,96,0.48)',
          'rgba(28,183,91,0.34)',
          'rgba(22,119,73,0.2)',
          'rgba(17,76,52,0.11)',
          'rgba(17,20,24,0.03)',
          'rgba(17,20,24,0)',
        ]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.18, 0.38, 0.6, 0.82, 1]}
        start={{ x: 0.5, y: 0 }}
        style={styles.fullFade}
      />
      <LinearGradient
        colors={['rgba(180,255,214,0.06)', 'rgba(30,215,96,0.08)', 'rgba(22,87,59,0.035)', 'rgba(17,20,24,0)']}
        end={{ x: 1, y: 0.82 }}
        locations={[0, 0.36, 0.68, 1]}
        start={{ x: 0, y: 0.04 }}
        style={styles.fullFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  fullFade: {
    ...StyleSheet.absoluteFillObject,
  },
});
