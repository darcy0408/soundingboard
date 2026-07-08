import { Redirect, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatSessionDate } from '@/lib/format';
import type { SessionRecord } from '@/lib/types';
import { useHistoryStore } from '@/stores/historyStore';
import { useOnboardingStore } from '@/stores/onboardingStore';

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const sessions = useHistoryStore((s) => s.sessions);

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding/welcome" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.appName}>
          SoundingBoard
        </ThemedText>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
          <ThemedText type="link" themeColor="textSecondary">
            Settings
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.modeCards}>
        <Pressable onPress={() => router.push('/rehearse/setup')}>
          <Card style={[styles.modeCard, { backgroundColor: theme.accent }]}>
            <ThemedText type="subtitle" style={{ color: theme.accentText }}>
              Rehearse a conversation
            </ThemedText>
            <ThemedText type="default" style={{ color: theme.accentText }}>
              Practice a hard conversation against a realistic pushback partner before you have it
              for real.
            </ThemedText>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/vent')}>
          <Card style={styles.modeCard}>
            <ThemedText type="subtitle">Vent it out</ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              Get it off your chest, then find the words for what you actually want to say.
            </ThemedText>
          </Card>
        </Pressable>
      </View>

      <ThemedText type="smallBold" style={styles.sectionTitle}>
        Recent sessions
      </ThemedText>

      {sessions.length === 0 ? (
        <Card style={styles.emptyState}>
          <ThemedText type="default" themeColor="textSecondary">
            Your practice sessions will show up here once you finish one.
          </ThemedText>
        </Card>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <SessionRow session={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function SessionRow({ session }: { session: SessionRecord }) {
  const router = useRouter();
  const theme = useTheme();
  const title =
    session.mode === 'rehearse'
      ? `Rehearse · ${session.config?.relationship || session.config?.name || 'Practice'}`
      : 'Vent session';

  return (
    <Pressable
      onPress={() => {
        if (session.feedback) {
          router.push(`/feedback/${session.id}`);
        }
      }}>
      <Card style={styles.sessionRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatSessionDate(session.createdAt)}
          </ThemedText>
        </View>
        {session.feedback && (
          <ThemedText type="small" style={{ color: theme.accent }}>
            Feedback
          </ThemedText>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  appName: {
    fontSize: 28,
    lineHeight: 34,
  },
  modeCards: {
    gap: Spacing.three,
  },
  modeCard: {
    gap: Spacing.one,
  },
  sectionTitle: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  emptyState: {
    alignItems: 'flex-start',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
