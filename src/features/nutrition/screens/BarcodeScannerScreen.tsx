import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Barcode, Search } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { RootStackParamList } from '@/navigation/types';

type Route = RouteProp<RootStackParamList, 'BarcodeScanner'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function BarcodeScannerScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  return (
    <Screen>
      <Card>
        <View style={styles.header}>
          <Barcode size={32} />
          <View style={styles.copy}>
            <AppText variant="title">Barcode lookup</AppText>
            <AppText muted>Scanner permissions and provider lookup are isolated behind the food provider contract.</AppText>
          </View>
        </View>
      </Card>
      <EmptyState
        icon={Barcode}
        title="Provider not configured"
        body="The MVP stores the architecture for barcode search. Add a public barcode provider or Supabase Edge Function and this screen can resolve codes into food items."
        actionLabel="Search instead"
        onAction={() => navigation.navigate('FoodSearch', route.params)}
      />
      <Button label="Add custom food" icon={Search} variant="secondary" onPress={() => navigation.navigate('CustomFood', route.params)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
});
