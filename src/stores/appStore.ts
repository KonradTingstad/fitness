import { create } from 'zustand';

import { DEMO_USER_ID } from '@/data/db/ids';
import { MealSlot } from '@/domain/models';

interface AppState {
  userId: string | null;
  hasCompletedOnboarding: boolean;
  selectedDiaryDate: string | null;
  selectedMealSlot: MealSlot;
  pendingSyncCount: number;
  setUserId: (userId: string | null) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setSelectedDiaryDate: (date: string) => void;
  setSelectedMealSlot: (slot: MealSlot) => void;
  setPendingSyncCount: (count: number) => void;
  continueWithDemoUser: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  hasCompletedOnboarding: false,
  selectedDiaryDate: null,
  selectedMealSlot: 'breakfast',
  pendingSyncCount: 0,
  setUserId: (userId) => set({ userId }),
  setOnboardingComplete: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),
  setSelectedDiaryDate: (selectedDiaryDate) => set({ selectedDiaryDate }),
  setSelectedMealSlot: (selectedMealSlot) => set({ selectedMealSlot }),
  setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
  continueWithDemoUser: () => set({ userId: DEMO_USER_ID, hasCompletedOnboarding: true }),
}));
