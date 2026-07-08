import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEntitlementStore } from '@/stores/entitlementStore';

// Static placeholder (SPEC §8 P2 = real RevenueCat wiring + gates). This screen exists now so
// the free-tier gate (SPEC §6) can be exercised end-to-end before RevenueCat lands.
export default function Paywall() {
  const router = useRouter();
  const theme = useTheme();
  const isPro = useEntitlementStore((s) => s.isPro);
  const setPro = useEntitlementStore((s) => s.setPro);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Walk in prepared
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          You’ve used your free sessions. Keep practicing with unlimited rehearsals, full feedback
          reports, and vent sessions.
        </ThemedText>

        <Card style={styles.plan}>
          <View style={styles.planHeader}>
            <ThemedText type="smallBold">Annual</ThemedText>
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <ThemedText type="small" style={{ color: theme.accentText }}>
                Save 58%
              </ThemedText>
            </View>
          </View>
          <ThemedText type="title" style={styles.price}>
            $49.99<ThemedText type="default">/year</ThemedText>
          </ThemedText>
        </Card>

        <Card style={styles.plan}>
          <ThemedText type="smallBold">Monthly</ThemedText>
          <ThemedText type="title" style={styles.price}>
            $9.99<ThemedText type="default">/month</ThemedText>
          </ThemedText>
        </Card>

        <ThemedText type="small" themeColor="textSecondary">
          Cancel anytime. No trial — pick the plan that fits.
        </ThemedText>
      </View>

      <View style={styles.footer}>
        <Button title="Continue with Annual" onPress={() => {}} />
        <Button title="Continue with Monthly" variant="secondary" onPress={() => {}} />
        <Pressable onPress={() => router.back()} style={styles.dismiss}>
          <ThemedText type="link" themeColor="textSecondary">
            Not now
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setPro(!isPro)}
          style={[styles.devToggle, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Dev only — {isPro ? 'unlocked (tap to re-lock)' : 'tap to unlock for testing'}
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  content: {
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  plan: {
    gap: Spacing.one,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  price: {
    fontSize: 24,
    lineHeight: 30,
  },
  footer: {
    gap: Spacing.two,
  },
  dismiss: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  devToggle: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
  },
});
