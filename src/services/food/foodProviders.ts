import { searchFoodItems } from '@/data/repositories/nutritionRepository';
import { FoodItem } from '@/domain/models';

export interface FoodSearchProvider {
  name: string;
  search(query: string): Promise<FoodItem[]>;
  lookupBarcode(barcode: string): Promise<FoodItem | null>;
}

export const localFoodProvider: FoodSearchProvider = {
  name: 'local',
  async search(query: string) {
    return searchFoodItems(query);
  },
  async lookupBarcode(barcode: string) {
    const results = await searchFoodItems(barcode);
    return results.find((food) => food.barcode === barcode) ?? null;
  },
};

export const foodProviders: FoodSearchProvider[] = [localFoodProvider];
