import { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildWitness, claimableCount, MAX_SESSIONS } from '@/lib/practiceProof';
import { useHistoryStore } from '@/stores/historyStore';

export default function PracticeProof() {
  const theme = useTheme();
  const sessions = useHistoryStore((s) => s.sessions);
  const [exporting, setExporting] = useState(false);

  const claimable = useMemo(() => claimableCount(sessions), [sessions]);
  const hasSomethingToProve = claimable > 0;

  const handleExport = async () => {
    setExporting(true);
    try {
      const witness = await buildWitness(sessions);
      await Share.share({
        message: JSON.stringify(witness, null, 2),
        title: 'Practice Proof input',
      });
    } catch {
      Alert.alert('Export failed', "Couldn't build the proof input. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="default">
        Practice Proof creates a receipt that you did the work, without showing anyone what you
        practised. You keep the sessions; they get the number.
      </ThemedText>

      <Card>
        <View style={styles.countRow}>
          <ThemedText type="title">{claimable}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            of {MAX_SESSIONS} sessions ready to prove
          </ThemedText>
        </View>
        {!hasSomethingToProve && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Finish a rehearsal session and it will count here. Vent sessions aren’t included.
          </ThemedText>
        )}
      </Card>

      <Section title="What gets proved">
        <Bullet theme={theme}>
          That you completed at least {hasSomethingToProve ? claimable : 'N'} rehearsal{' '}
          {claimable === 1 ? 'session' : 'sessions'} on this device.
        </Bullet>
        <Bullet theme={theme}>
          That each one was a separate session — the same session can’t be counted twice.
        </Bullet>
      </Section>

      <Section title="What never leaves this device">
        <Bullet theme={theme}>Every transcript, word for word.</Bullet>
        <Bullet theme={theme}>Your scores and feedback reports.</Bullet>
        <Bullet theme={theme}>Who each conversation was with, and what it was about.</Bullet>
        <Bullet theme={theme}>When any individual session happened.</Bullet>
      </Section>

      <Button
        title={exporting ? 'Preparing…' : 'Export proof input'}
        onPress={handleExport}
        disabled={!hasSomethingToProve}
        loading={exporting}
      />

      <Card>
        <ThemedText type="smallBold">Keep the export private</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          The exported file contains the private key that this receipt is issued against. Anyone who
          has it could claim your practice as theirs. Send it only to the device you’re generating
          the proof on, and delete it afterwards.
        </ThemedText>
      </Card>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <Card>
        <View style={styles.bullets}>{children}</View>
      </Card>
    </View>
  );
}

function Bullet({ children, theme }: { children: React.ReactNode; theme: { accent: string } }) {
  return (
    <View style={styles.bullet}>
      <ThemedText type="default" style={{ color: theme.accent }}>
        •
      </ThemedText>
      <ThemedText type="default" style={styles.bulletText}>
        {children}
      </ThemedText>
    </View>
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
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  bullets: {
    gap: Spacing.two,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  hint: {
    marginTop: Spacing.two,
    lineHeight: 19,
  },
});
