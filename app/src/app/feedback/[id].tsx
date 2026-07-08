import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ScoreBar } from '@/components/score-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FeedbackMoment } from '@/lib/types';
import { useHistoryStore } from '@/stores/historyStore';
import { useSessionStore } from '@/stores/sessionStore';

export default function Feedback() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const record = useHistoryStore((s) => s.getSession(params.id));
  const startSession = useSessionStore((s) => s.startSession);

  if (!record || !record.feedback) {
    return (
      <SafeAreaView style={styles.fallback}>
        <ThemedText type="default" themeColor="textSecondary">
          Couldn’t find that feedback report.
        </ThemedText>
        <Button title="Back to Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const { feedback, config } = record;
  // Schema-level maxItems isn't supported by structured outputs (prompts/feedback.md) — the
  // prompt enforces at most 3, the app truncates defensively.
  const moments = feedback.moments.slice(0, 3);

  const onPracticeAgain = () => {
    const id = startSession('rehearse', config);
    router.replace(`/session/${id}`);
  };

  return (
    <>
      <Stack.Screen
        options={{ title: config?.name ? `Feedback · ${config.name}` : 'Feedback' }}
      />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.scores}>
            <ScoreBar label="Clarity" score={feedback.scores.clarity} />
            <ScoreBar label="Composure" score={feedback.scores.composure} />
            <ScoreBar label="Assertiveness" score={feedback.scores.assertiveness} />
          </Card>

          {moments.length > 0 && (
            <View style={styles.block}>
              <ThemedText type="smallBold" style={styles.blockTitle}>
                Key moments
              </ThemedText>
              <View style={styles.stack}>
                {moments.map((moment, index) => (
                  <MomentCard key={index} moment={moment} />
                ))}
              </View>
            </View>
          )}

          <Card style={styles.oneThing}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              One thing to practice
            </ThemedText>
            <ThemedText type="default" style={styles.oneThingText}>
              {feedback.one_thing}
            </ThemedText>
          </Card>

          <ThemedText type="default" themeColor="textSecondary" style={styles.encouragement}>
            {feedback.encouragement}
          </ThemedText>

          <View style={styles.actions}>
            <Button title="Practice again" onPress={onPracticeAgain} />
            <Button title="Done" variant="secondary" onPress={() => router.replace('/')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function MomentCard({ moment }: { moment: FeedbackMoment }) {
  const theme = useTheme();
  const worked = moment.type === 'worked';
  const accent = worked ? theme.success : theme.warning;
  const background = worked ? theme.successBackground : theme.warningBackground;

  return (
    <Card style={styles.momentCard}>
      <View style={[styles.quoteBlock, { borderLeftColor: accent }]}>
        <ThemedText type="default" style={styles.quoteText}>
          “{moment.quote}”
        </ThemedText>
      </View>
      <View style={[styles.badge, { backgroundColor: background }]}>
        <ThemedText type="small" style={{ color: accent }}>
          {worked ? 'Worked' : 'Try instead'}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {moment.note}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  scores: {
    gap: Spacing.three,
  },
  block: {
    gap: Spacing.two,
  },
  blockTitle: {
    marginBottom: Spacing.half,
  },
  stack: {
    gap: Spacing.two,
  },
  momentCard: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  quoteBlock: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.two,
  },
  quoteText: {
    fontStyle: 'italic',
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  oneThing: {
    gap: Spacing.one,
  },
  oneThingText: {
    lineHeight: 22,
  },
  encouragement: {
    fontStyle: 'italic',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
