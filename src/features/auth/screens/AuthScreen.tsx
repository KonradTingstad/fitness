import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { continueWithLocalDemo, signInWithEmail, startLocalOnboarding } from '@/services/auth/authService';
import { useAppStore } from '@/stores/appStore';
import { useAppTheme } from '@/theme/theme';

export function AuthScreen() {
  const theme = useAppTheme();
  const setUserId = useAppStore((state) => state.setUserId);
  const setOnboardingComplete = useAppStore((state) => state.setOnboardingComplete);
  const [email, setEmail] = useState('demo@formfuel.local');
  const [password, setPassword] = useState('');

  const handleDemo = async () => {
    const userId = await continueWithLocalDemo();
    setUserId(userId);
    setOnboardingComplete(true);
  };

  const handleOnboarding = async () => {
    const userId = await startLocalOnboarding();
    setUserId(userId);
    setOnboardingComplete(false);
  };

  const handleEmail = async () => {
    try {
      const userId = await signInWithEmail(email, password);
      setUserId(userId);
      setOnboardingComplete(true);
    } catch (error) {
      Alert.alert('Sign in failed', error instanceof Error ? error.message : 'Unable to sign in.');
    }
  };

  return (
    <Screen scroll={false}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Activity color={theme.colors.primary} size={34} strokeWidth={2.8} />
        </View>
        <AppText variant="hero">FormFuel</AppText>
        <AppText muted style={styles.subtitle}>
          Training logs and nutrition targets in one fast offline-first app.
        </AppText>
      </View>

      <Card>
        <AppText variant="section">Sign in</AppText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
        />
        <Button label="Continue" onPress={handleEmail} icon={ArrowRight} />
        <Button label="Use local demo (no cloud sync)" onPress={handleDemo} variant="secondary" icon={ShieldCheck} />
      </Card>

      <Button label="Start goal setup" onPress={handleOnboarding} variant="ghost" icon={ArrowRight} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 12,
    justifyContent: 'flex-end',
    minHeight: 240,
  },
  mark: {
    alignItems: 'center',
    borderRadius: 8,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  subtitle: {
    lineHeight: 22,
    maxWidth: 320,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
  },
});
