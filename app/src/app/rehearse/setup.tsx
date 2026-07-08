import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DIFFICULTIES, SCENARIO_CATEGORIES, SCENARIO_PRESETS, TEMPERAMENTS } from '@/lib/scenarios';
import type { Difficulty, PersonaConfig, ScenarioCategory, Temperament } from '@/lib/types';
import { useSessionStore } from '@/stores/sessionStore';

export default function RehearseSetup() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ fromVent?: string }>();
  const startSession = useSessionStore((s) => s.startSession);
  const fromVent = params.fromVent === '1';

  const [category, setCategory] = useState<ScenarioCategory | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    fromVent ? 'custom' : null
  );
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [temperament, setTemperament] = useState<Temperament | null>(
    fromVent ? 'Dismissive' : null
  );
  const [goal, setGoal] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>(2);

  const applyPreset = (
    presetId: string,
    presetRelationship: string,
    presetTemperament: Temperament,
    presetGoal: string
  ) => {
    setSelectedPresetId(presetId);
    setRelationship(presetRelationship);
    setTemperament(presetTemperament);
    setGoal(presetGoal);
  };

  const canStart = name.trim().length > 0 && relationship.trim().length > 0 && !!temperament;

  const onStart = () => {
    if (!temperament) return;
    const config: PersonaConfig = {
      name: name.trim(),
      relationship: relationship.trim(),
      temperament,
      goal: goal.trim(),
      difficulty,
    };
    const id = startSession('rehearse', config);
    router.push(`/session/${id}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {fromVent && (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              Carried over from your vent session — fill in who this is and what you want to say.
            </ThemedText>
          </Card>
        )}

        <View style={styles.block}>
          <ThemedText type="smallBold" style={styles.blockTitle}>
            Category
          </ThemedText>
          <View style={styles.chipRow}>
            {SCENARIO_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </View>

        {category && (
          <View style={styles.block}>
            <ThemedText type="smallBold" style={styles.blockTitle}>
              Scenario
            </ThemedText>
            <View style={styles.stack}>
              {SCENARIO_PRESETS[category].map((preset) => (
                <Pressable
                  key={preset.id}
                  onPress={() =>
                    applyPreset(
                      preset.id,
                      preset.relationship,
                      preset.temperament,
                      preset.goal
                    )
                  }>
                  <Card
                    style={[
                      styles.optionCard,
                      selectedPresetId === preset.id && {
                        borderColor: theme.accent,
                        borderWidth: 2,
                      },
                    ]}>
                    <ThemedText type="default">{preset.title}</ThemedText>
                  </Card>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Pressable onPress={() => setSelectedPresetId('custom')}>
          <Card
            style={[
              styles.optionCard,
              selectedPresetId === 'custom' && { borderColor: theme.accent, borderWidth: 2 },
            ]}>
            <ThemedText type="default">Describe your own</ThemedText>
          </Card>
        </Pressable>

        <View style={styles.block}>
          <ThemedText type="smallBold" style={styles.blockTitle}>
            Who are you talking to?
          </ThemedText>
          <TextInput
            style={[styles.input, inputTheme(theme)]}
            placeholder="Their name (e.g. Mom, Jess)"
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[styles.input, inputTheme(theme)]}
            placeholder="Relationship (e.g. mother, roommate, manager)"
            placeholderTextColor={theme.textSecondary}
            value={relationship}
            onChangeText={setRelationship}
          />
        </View>

        <View style={styles.block}>
          <ThemedText type="smallBold" style={styles.blockTitle}>
            Temperament
          </ThemedText>
          <View style={styles.stack}>
            {TEMPERAMENTS.map((t) => (
              <Pressable key={t.value} onPress={() => setTemperament(t.value)}>
                <Card
                  style={[
                    styles.optionCard,
                    temperament === t.value && { borderColor: theme.accent, borderWidth: 2 },
                  ]}>
                  <ThemedText type="smallBold">{t.value}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.description}
                  </ThemedText>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <ThemedText type="smallBold" style={styles.blockTitle}>
            What do you want out of this conversation?
          </ThemedText>
          <TextInput
            style={[styles.input, styles.multiline, inputTheme(theme)]}
            placeholder="e.g. Get them to actually help with the dishes without a fight"
            placeholderTextColor={theme.textSecondary}
            value={goal}
            onChangeText={setGoal}
            multiline
          />
        </View>

        <View style={styles.block}>
          <ThemedText type="smallBold" style={styles.blockTitle}>
            Difficulty
          </ThemedText>
          <View style={styles.stack}>
            {DIFFICULTIES.map((d) => (
              <Pressable key={d.value} onPress={() => setDifficulty(d.value)}>
                <Card
                  style={[
                    styles.optionCard,
                    difficulty === d.value && { borderColor: theme.accent, borderWidth: 2 },
                  ]}>
                  <ThemedText type="smallBold">{d.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.description}
                  </ThemedText>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>

        <Button title="Start" onPress={onStart} disabled={!canStart} style={styles.startButton} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function inputTheme(theme: ReturnType<typeof useTheme>) {
  return {
    color: theme.text,
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
  };
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  block: {
    gap: Spacing.two,
  },
  blockTitle: {
    marginBottom: Spacing.half,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stack: {
    gap: Spacing.two,
  },
  optionCard: {
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  startButton: {
    marginTop: Spacing.two,
  },
});
