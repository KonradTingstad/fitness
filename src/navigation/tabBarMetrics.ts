import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const FLOATING_TAB_BAR_HEIGHT = 62;
const FLOATING_TAB_BAR_MIN_BOTTOM_OFFSET = 12;
const FLOATING_TAB_BAR_SAFE_AREA_ADJUSTMENT = -4;
const FLOATING_TAB_BAR_CONTENT_BUFFER = 16;

export function getFloatingTabBarBottomOffset(bottomInset: number): number {
  return Math.max(bottomInset + FLOATING_TAB_BAR_SAFE_AREA_ADJUSTMENT, FLOATING_TAB_BAR_MIN_BOTTOM_OFFSET);
}

export function getFloatingTabBarClearance(bottomInset: number, extra = 0): number {
  return FLOATING_TAB_BAR_HEIGHT + getFloatingTabBarBottomOffset(bottomInset) + FLOATING_TAB_BAR_CONTENT_BUFFER + extra;
}

export function useFloatingTabBarClearance(extra = 0): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  if (tabBarHeight === undefined) {
    return 0;
  }
  return getFloatingTabBarClearance(insets.bottom, extra);
}
