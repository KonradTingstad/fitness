import { adherencePercent, remainingMacros, sumDiaryEntries } from '@/domain/calculations/nutrition';
import { DiaryEntry, GoalSettings } from '@/domain/models';

const baseEntry: DiaryEntry = {
  id: 'entry',
  userId: 'user',
  diaryDayId: 'day',
  mealSlot: 'breakfast',
  foodItemId: 'food',
  servings: 2,
  loggedAt: '2026-04-22T08:00:00.000Z',
  foodNameSnapshot: 'Greek Yogurt',
  caloriesSnapshot: 150,
  proteinGSnapshot: 23,
  carbsGSnapshot: 8,
  fatGSnapshot: 4,
  fiberGSnapshot: 0,
  sodiumMgSnapshot: 95,
  createdAt: '2026-04-22T08:00:00.000Z',
  updatedAt: '2026-04-22T08:00:00.000Z',
  deletedAt: null,
  syncStatus: 'synced',
  version: 1,
};

const goals: GoalSettings = {
  id: 'goals',
  userId: 'user',
  goal: 'maintain',
  activityLevel: 'moderate',
  workoutsPerWeekTarget: 4,
  calorieTarget: 2500,
  proteinTargetG: 160,
  carbTargetG: 280,
  fatTargetG: 80,
  waterTargetMl: 2800,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncStatus: 'synced',
  version: 1,
};

describe('nutrition calculations', () => {
  it('sums diary entries using serving multipliers', () => {
    const totals = sumDiaryEntries([baseEntry]);
    expect(totals.calories).toBe(300);
    expect(totals.proteinG).toBe(46);
    expect(totals.sodiumMg).toBe(190);
  });

  it('calculates remaining targets', () => {
    const remaining = remainingMacros(sumDiaryEntries([baseEntry]), goals);
    expect(remaining.calories).toBe(2200);
    expect(remaining.proteinG).toBe(114);
  });

  it('scores adherence inside tolerance as complete', () => {
    expect(adherencePercent(2520, 2500, 0.05)).toBe(100);
    expect(adherencePercent(1800, 2500, 0.05)).toBeLessThan(100);
  });
});
