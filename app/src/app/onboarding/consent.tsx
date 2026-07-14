import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { AI_CONSENT_TEXT, DISCLAIMER_TEXT, PRIVACY_POLICY_URL } from '@/lib/copy';
import { useOnboardingStore } from '@/stores/onboardingStore';

export default function OnboardingConsent() {
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title" style={styles.title}>
          Before you start
        </ThemedText>

        <View style={styles.consentBlock}>
          <ThemedText type="default">{AI_CONSENT_TEXT}</ThemedText>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <ThemedText type="linkPrimary">Privacy Policy</ThemedText>
          </Pressable>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          {DISCLAIMER_TEXT}
        </ThemedText>
      </ScrollView>

      <Button
        title="Agree & continue"
        onPress={() => {
          complete();
          router.replace('/');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.five,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  consentBlock: {
    gap: Spacing.two,
  },
  disclaimer: {
    lineHeight: 19,
  },
});
