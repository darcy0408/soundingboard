import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AI_CONSENT_TEXT, DISCLAIMER_TEXT } from '@/lib/copy';
import { restorePurchases } from '@/lib/purchases';
import { useEntitlementStore } from '@/stores/entitlementStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useOnboardingStore } from '@/stores/onboardingStore';

export default function Settings() {
  const router = useRouter();
  const theme = useTheme();
  const clearHistory = useHistoryStore((s) => s.clearAll);
  const resetEntitlement = useEntitlementStore((s) => s.reset);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const handleRestore = async () => {
    try {
      const isPro = await restorePurchases();
      Alert.alert(
        isPro ? 'Restored' : 'Nothing to restore',
        isPro
          ? 'Your subscription is active on this device.'
          : "We didn't find an active subscription for this Apple ID."
      );
    } catch {
      Alert.alert('Restore failed', "Couldn't reach the App Store. Try again in a moment.");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete all my data?',
      'This removes every session, transcript, and feedback report stored on this device. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            clearHistory();
            resetEntitlement();
            resetOnboarding();
            router.replace('/onboarding/welcome');
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Privacy">
        <ThemedText type="default">{AI_CONSENT_TEXT}</ThemedText>
      </Section>

      <Section title="Disclaimer">
        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          {DISCLAIMER_TEXT}
        </ThemedText>
      </Section>

      <Section title="Your data">
        <Row
          label="Delete all my data"
          onPress={confirmDelete}
          labelColor={theme.danger}
        />
      </Section>

      <Section title="Account">
        <Row label="Restore Purchases" onPress={handleRestore} />
        <Row
          label="Privacy Policy"
          onPress={() =>
            Alert.alert('Privacy Policy', 'The privacy policy will be linked here at launch.')
          }
        />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <Card>{children}</Card>
    </View>
  );
}

function Row({
  label,
  onPress,
  labelColor,
}: {
  label: string;
  onPress: () => void;
  labelColor?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <ThemedText type="default" style={labelColor ? { color: labelColor } : undefined}>
        {label}
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.5,
  },
  disclaimer: {
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
});
