import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_USER_ID } from '@/data/db/ids';
import { isSupabaseConfigured, supabase } from '@/data/sync/supabase';

const USER_ID_KEY = 'formfuel.userId';
const ONBOARDING_KEY = 'formfuel.onboardingComplete';

async function readAuthValue(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function writeAuthValue(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function deleteAuthValue(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

export async function restoreAuthState(): Promise<{ userId: string | null; hasCompletedOnboarding: boolean }> {
  const [userId, onboarding] = await Promise.all([readAuthValue(USER_ID_KEY), readAuthValue(ONBOARDING_KEY)]);
  return {
    userId,
    hasCompletedOnboarding: onboarding === 'true',
  };
}

export async function continueWithLocalDemo(): Promise<string> {
  await Promise.all([writeAuthValue(USER_ID_KEY, DEMO_USER_ID), writeAuthValue(ONBOARDING_KEY, 'true')]);
  return DEMO_USER_ID;
}

export async function startLocalOnboarding(): Promise<string> {
  await Promise.all([writeAuthValue(USER_ID_KEY, DEMO_USER_ID), writeAuthValue(ONBOARDING_KEY, 'false')]);
  return DEMO_USER_ID;
}

export async function signInWithEmail(email: string, password: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    return continueWithLocalDemo();
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  const userId = data.user?.id ?? DEMO_USER_ID;
  await writeAuthValue(USER_ID_KEY, userId);
  return userId;
}

export async function markOnboardingComplete(): Promise<void> {
  await writeAuthValue(ONBOARDING_KEY, 'true');
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  await Promise.all([deleteAuthValue(USER_ID_KEY), deleteAuthValue(ONBOARDING_KEY)]);
}
