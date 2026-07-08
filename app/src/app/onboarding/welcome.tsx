import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function OnboardingWelcome() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.appName}>
          SoundingBoard
        </ThemedText>
        <ThemedText type="subtitle" style={styles.tagline}>
          Practice the conversation before it happens.
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
          Rehearse a hard conversation against a realistic pushback partner, or vent it out and
          find the words for what you actually want to say. Both build the same skill: saying it
          clearly, out loud, before it counts.
        </ThemedText>
      </View>

      <Button title="Continue" onPress={() => router.push('/onboarding/consent')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    justifyContent: 'flex-end',
    gap: Spacing.five,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  appName: {
    fontSize: 28,
    lineHeight: 34,
  },
  tagline: {
    fontSize: 26,
    lineHeight: 32,
  },
  body: {
    marginTop: Spacing.two,
  },
});
