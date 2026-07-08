import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, MAX_TURN_CHARS, getFeedback, sendTurn } from '@/lib/api';
import { VENT_TTS_TEMPERAMENT, speakReply, stopSpokenReply } from '@/lib/tts';
import type { SessionRecord } from '@/lib/types';
import { TURN_CAP, useSessionStore } from '@/stores/sessionStore';
import { useEntitlementStore } from '@/stores/entitlementStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';

export default function Session() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const [draft, setDraft] = useState('');
  const [endingBusy, setEndingBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const finalTranscriptRef = useRef('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);

  const id = useSessionStore((s) => s.id);
  const mode = useSessionStore((s) => s.mode);
  const config = useSessionStore((s) => s.config);
  const messages = useSessionStore((s) => s.messages);
  const turnIndex = useSessionStore((s) => s.turnIndex);
  const status = useSessionStore((s) => s.status);
  const createdAt = useSessionStore((s) => s.createdAt);
  const appendUserMessage = useSessionStore((s) => s.appendUserMessage);
  const appendAssistantMessage = useSessionStore((s) => s.appendAssistantMessage);
  const setStatus = useSessionStore((s) => s.setStatus);
  const incrementTurn = useSessionStore((s) => s.incrementTurn);
  const resetSession = useSessionStore((s) => s.reset);

  const addOrUpdateSession = useHistoryStore((s) => s.addOrUpdateSession);
  const isGated = useEntitlementStore((s) => s.isGated());
  const recordSessionCompleted = useEntitlementStore((s) => s.recordSessionCompleted);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, status]);

  // Visual feedback while the mic is held (SPEC §2 push-to-talk): a gentle pulse + color change.
  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulseAnim]);

  // Speech-to-text results stream in here while the mic is held (interimResults: true) — the
  // ref always holds the latest transcript (interim or final) so the `end` handler below can send
  // it regardless of exactly when/whether an isFinal:true result arrives (iOS only finalizes
  // after `stop()` is called, per the library's docs).
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    finalTranscriptRef.current = transcript;
    setInterimTranscript(transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    setInterimTranscript('');
    const finalText = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = '';
    if (finalText) {
      void sendMessage(finalText);
    } else {
      Alert.alert("Didn't catch that", 'Try holding the mic again, or type your message instead.');
    }
  });

  useSpeechRecognitionEvent('error', () => {
    // The library always follows an `error` event with `end` (mirrors the Web Speech API this
    // wraps), so `end` above is what actually resets state/messaging — this just guarantees the
    // pulsing indicator stops immediately rather than waiting on `end`.
    setIsRecording(false);
  });

  // Stop any spoken reply and cancel an in-progress recording when the screen goes away.
  useEffect(() => {
    return () => {
      stopSpokenReply();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // No active recognition session, or native module unavailable (e.g. Expo Go) — fine to
        // ignore, there's nothing to clean up either way.
      }
    };
  }, []);

  if (!id || id !== params.id || !mode) {
    return (
      <SafeAreaView style={styles.fallback}>
        <ThemedText type="default" themeColor="textSecondary">
          This session isn’t active anymore.
        </ThemedText>
        <Button title="Back to Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  // Re-bind to new `const`s so TS keeps the non-null narrowing from the guard above inside the
  // nested handlers below (narrowing on a captured outer variable doesn't survive a closure
  // boundary, but a fresh `const` assigned from the narrowed value does).
  const sessionId = id;
  const sessionMode = mode;

  const userTurnCount = messages.filter((m) => m.role === 'user').length;
  const isCapped = turnIndex >= TURN_CAP;
  const awaitingReply = status === 'awaiting-reply';
  const headerTitle = sessionMode === 'rehearse' ? config?.name || 'Rehearse' : 'Vent';
  const endLabel = sessionMode === 'rehearse' ? 'End & get feedback' : 'Done';
  const showVentPill = sessionMode === 'vent' && userTurnCount >= 3;

  // Shared by the typed Send button and the push-to-talk release handler below (SPEC §2: voice
  // sends immediately on release, it doesn't populate the text input for editing first).
  async function sendMessage(text: string) {
    if (!text || awaitingReply || isCapped) return;
    if (text.length > MAX_TURN_CHARS) {
      Alert.alert('Message too long', `Keep messages under ${MAX_TURN_CHARS} characters.`);
      return;
    }

    const outgoing = [...messages, { role: 'user' as const, content: text }];
    setDraft('');
    appendUserMessage(text);
    setStatus('awaiting-reply');
    const nextTurnIndex = incrementTurn();

    try {
      const reply = await sendTurn(config, outgoing, nextTurnIndex, sessionMode);
      appendAssistantMessage(reply);
      setStatus('idle');
      if (voiceEnabled) {
        // Fire-and-forget — the reply bubble above already rendered, audio plays whenever it's
        // ready (SPEC §8: never block the chat UI on audio).
        void speakReply(reply, config?.temperament ?? VENT_TTS_TEMPERAMENT);
      }
    } catch (err) {
      setStatus('idle');
      const message =
        err instanceof ApiError ? err.message : "Something went wrong. Give it another try.";
      Alert.alert(
        err instanceof ApiError && err.status === 429 ? 'Practice limit reached' : "Couldn't send that",
        message
      );
    }
  }

  function handleSend() {
    void sendMessage(draft.trim());
  }

  async function handleMicPressIn() {
    if (awaitingReply || isCapped || endingBusy || isRecording) return;

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone access needed',
          'SoundingBoard needs microphone and speech recognition access for push-to-talk. You can still type your side of the conversation.',
          [{ text: 'Use typing instead', style: 'cancel' }]
        );
        return;
      }
    } catch {
      // Most likely the native module isn't available — expo-speech-recognition requires an EAS
      // development build and does not work inside Expo Go (SPEC §2).
      Alert.alert(
        'Voice input unavailable',
        "Push-to-talk needs a development build — it doesn't work in Expo Go. Type your message instead.",
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    finalTranscriptRef.current = '';
    setInterimTranscript('');
    setIsRecording(true);
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch {
      setIsRecording(false);
      Alert.alert("Couldn't start the microphone", 'Type your message instead.');
    }
  }

  function handleMicPressOut() {
    if (!isRecording) return;
    // Requests a final result (delivered via the `result`/`end` events above) rather than
    // aborting outright, so a short utterance still gets sent.
    ExpoSpeechRecognitionModule.stop();
  }

  function handleToggleVoice() {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopSpokenReply();
    }
  }

  async function handleEnd() {
    if (isGated) {
      router.push('/paywall');
      return;
    }

    if (sessionMode === 'rehearse') {
      if (!config) {
        Alert.alert('Something went wrong', 'This session is missing its setup. Start a new one.');
        return;
      }
      if (userTurnCount === 0) {
        Alert.alert('Nothing to review yet', 'Send at least one message before ending.');
        return;
      }
      setEndingBusy(true);
      try {
        const feedback = await getFeedback(config, messages);
        const record: SessionRecord = {
          id: sessionId,
          mode: 'rehearse',
          config,
          messages,
          createdAt: createdAt ?? Date.now(),
          completedAt: Date.now(),
          feedback,
        };
        addOrUpdateSession(record);
        recordSessionCompleted();
        resetSession();
        router.replace(`/feedback/${sessionId}`);
      } catch (err) {
        setEndingBusy(false);
        const message =
          err instanceof ApiError ? err.message : 'Could not get your feedback. Try again.';
        Alert.alert(
          err instanceof ApiError && err.status === 429 ? 'Practice limit reached' : 'Something went wrong',
          message
        );
      }
    } else {
      const record: SessionRecord = {
        id: sessionId,
        mode: 'vent',
        config: null,
        messages,
        createdAt: createdAt ?? Date.now(),
        completedAt: Date.now(),
        feedback: null,
      };
      addOrUpdateSession(record);
      recordSessionCompleted();
      resetSession();
      router.replace('/');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={handleToggleVoice}
                hitSlop={8}
                accessibilityRole="switch"
                accessibilityLabel={voiceEnabled ? 'Mute voice replies' : 'Unmute voice replies'}
                accessibilityState={{ checked: voiceEnabled }}>
                <ThemedText type="default" themeColor={voiceEnabled ? 'text' : 'textSecondary'}>
                  {voiceEnabled ? '🔊' : '🔇'}
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleEnd} disabled={endingBusy} hitSlop={8}>
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.accent, opacity: endingBusy ? 0.5 : 1 }}>
                  {endLabel}
                </ThemedText>
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.transcript}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.length === 0 && (
              <ThemedText type="default" themeColor="textSecondary" style={styles.emptyHint}>
                {sessionMode === 'rehearse'
                  ? `Say the first thing you'd say to ${config?.name || 'them'}.`
                  : "Say what's going on. No filter needed."}
              </ThemedText>
            )}
            {messages.map((message, index) => (
              <Bubble key={index} role={message.role} content={message.content} />
            ))}
            {awaitingReply && <TypingBubble />}
          </ScrollView>

          {endingBusy && (
            <View style={styles.busyBanner}>
              <ThemedText type="small" themeColor="textSecondary">
                Putting together your feedback…
              </ThemedText>
            </View>
          )}

          {isCapped && !endingBusy && (
            <View style={[styles.capBanner, { backgroundColor: theme.warningBackground }]}>
              <ThemedText type="small" style={{ color: theme.warning }}>
                You’ve reached the practice limit for this session — wrap up and{' '}
                {sessionMode === 'rehearse' ? 'get your feedback' : 'finish up'}.
              </ThemedText>
            </View>
          )}

          {showVentPill && (
            <Pressable
              onPress={() => router.push('/rehearse/setup?fromVent=1')}
              style={[styles.pill, { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                Turn this into a practice session
              </ThemedText>
            </Pressable>
          )}

          <View style={[styles.inputRow, { borderTopColor: theme.border }]}>
            <Pressable
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              disabled={awaitingReply || isCapped || endingBusy}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
              style={{ opacity: awaitingReply || isCapped || endingBusy ? 0.5 : 1 }}>
              <Animated.View
                style={[
                  styles.micButton,
                  {
                    borderColor: isRecording ? theme.danger : theme.border,
                    backgroundColor: isRecording ? theme.danger : 'transparent',
                    transform: [{ scale: pulseAnim }],
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{ color: isRecording ? theme.accentText : theme.textSecondary }}>
                  {isRecording ? '●' : 'Mic'}
                </ThemedText>
              </Animated.View>
            </Pressable>
            {isRecording ? (
              <View
                style={[
                  styles.textInput,
                  styles.transcriptPreview,
                  { backgroundColor: theme.backgroundElement },
                ]}>
                <ThemedText
                  type="default"
                  themeColor="textSecondary"
                  style={styles.transcriptText}
                  numberOfLines={4}>
                  {interimTranscript || 'Listening…'}
                </ThemedText>
              </View>
            ) : (
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
                placeholder="Type what you'd say…"
                placeholderTextColor={theme.textSecondary}
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!isCapped}
              />
            )}
            <Pressable
              onPress={handleSend}
              disabled={awaitingReply || isCapped || isRecording || draft.trim().length === 0}
              style={[
                styles.sendButton,
                {
                  backgroundColor: theme.accent,
                  opacity:
                    awaitingReply || isCapped || isRecording || draft.trim().length === 0
                      ? 0.5
                      : 1,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                Send
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const theme = useTheme();
  const isUser = role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? theme.accent : theme.backgroundElement,
            borderBottomRightRadius: isUser ? 4 : Spacing.three,
            borderBottomLeftRadius: isUser ? Spacing.three : 4,
          },
        ]}>
        <ThemedText type="default" style={{ color: isUser ? theme.accentText : theme.text }}>
          {content}
        </ThemedText>
      </View>
    </View>
  );
}

function TypingBubble() {
  const theme = useTheme();
  return (
    <View style={styles.bubbleRow}>
      <View
        style={[
          styles.bubble,
          styles.typingBubble,
          { backgroundColor: theme.backgroundElement },
        ]}>
        <ThemedText type="default" themeColor="textSecondary">
          …
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  transcript: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  emptyHint: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  typingBubble: {
    paddingVertical: Spacing.one,
  },
  busyBanner: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  capBanner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  pill: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  transcriptPreview: {
    justifyContent: 'center',
  },
  transcriptText: {
    opacity: 0.7,
    fontStyle: 'italic',
  },
  sendButton: {
    paddingHorizontal: Spacing.three,
    height: 40,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
