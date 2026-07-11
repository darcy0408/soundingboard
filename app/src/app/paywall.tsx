import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchPlans, PurchaseCancelledError, purchase, type Plans } from '@/lib/purchases';
import { useEntitlementStore } from '@/stores/entitlementStore';

// SPEC.md §6's fixed marketing prices/copy — shown until real RevenueCat packages load (or if
// they never do, e.g. no RevenueCat project configured yet). Real prices come from the App Store
// via RevenueCat once available, but the annual plan's "Save 58%" badge is a fixed comparison
// against these target prices either way, not derived from whatever loads.
const FALLBACK_MONTHLY_PRICE = '$9.99';
const FALLBACK_ANNUAL_PRICE = '$49.99';

export default function Paywall() {
  const router = useRouter();
  const theme = useTheme();
  const isPro = useEntitlementStore((s) => s.isPro);
  const setPro = useEntitlementStore((s) => s.setPro);

  const [plans, setPlans] = useState<Plans>({ monthly: null, annual: null });
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans().then(setPlans);
  }, []);

  async function handlePurchase(pkg: PurchasesPackage | null, fallbackLabel: string) {
    if (!pkg) {
      Alert.alert(
        'Not available yet',
        `${fallbackLabel} isn't set up for purchase in this build yet. Check back soon.`
      );
      return;
    }
    setPurchasingId(pkg.identifier);
    try {
      await purchase(pkg);
      router.back();
    } catch (err) {
      if (!(err instanceof PurchaseCancelledError)) {
        Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasingId(null);
    }
  }

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
            {plans.annual?.product.priceString ?? FALLBACK_ANNUAL_PRICE}
            <ThemedText type="default">/year</ThemedText>
          </ThemedText>
        </Card>

        <Card style={styles.plan}>
          <ThemedText type="smallBold">Monthly</ThemedText>
          <ThemedText type="title" style={styles.price}>
            {plans.monthly?.product.priceString ?? FALLBACK_MONTHLY_PRICE}
            <ThemedText type="default">/month</ThemedText>
          </ThemedText>
        </Card>

        <ThemedText type="small" themeColor="textSecondary">
          Cancel anytime. No trial — pick the plan that fits.
        </ThemedText>
      </View>

      <View style={styles.footer}>
        <Button
          title="Continue with Annual"
          loading={purchasingId === plans.annual?.identifier && purchasingId !== null}
          disabled={purchasingId !== null}
          onPress={() => handlePurchase(plans.annual, 'The annual plan')}
        />
        <Button
          title="Continue with Monthly"
          variant="secondary"
          loading={purchasingId === plans.monthly?.identifier && purchasingId !== null}
          disabled={purchasingId !== null}
          onPress={() => handlePurchase(plans.monthly, 'The monthly plan')}
        />
        <Pressable onPress={() => router.back()} style={styles.dismiss}>
          <ThemedText type="link" themeColor="textSecondary">
            Not now
          </ThemedText>
        </Pressable>

        {__DEV__ && (
          <Pressable
            onPress={() => setPro(!isPro)}
            style={[styles.devToggle, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Dev only — {isPro ? 'unlocked (tap to re-lock)' : 'tap to unlock for testing'}
            </ThemedText>
          </Pressable>
        )}
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
