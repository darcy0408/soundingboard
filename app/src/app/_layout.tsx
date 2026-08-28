import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { useOnboardingStore } from '@/stores/onboardingStore';
import { useTheme } from '@/hooks/use-theme';
import { initPurchases } from '@/lib/purchases';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated);

  useEffect(() => {
    initPurchases();
  }, []);

  useEffect(() => {
    if (hasHydrated) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasHydrated]);

  if (!hasHydrated) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding/welcome"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="onboarding/consent"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="rehearse/setup" options={{ title: 'New session' }} />
        <Stack.Screen name="session/[id]" options={{ title: '' }} />
        <Stack.Screen name="feedback/[id]" options={{ title: 'Feedback' }} />
        <Stack.Screen name="vent" options={{ headerShown: false }} />
        <Stack.Screen
          name="paywall"
          options={{ title: 'SoundingBoard Plus', presentation: 'modal' }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="practice-proof" options={{ title: 'Practice Proof' }} />
      </Stack>
    </ThemeProvider>
  );
}
