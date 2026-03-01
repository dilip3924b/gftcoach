import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AIMessageCard from '../components/AIMessageCard';
import AITypingIndicator from '../components/AITypingIndicator';
import { C } from '../lib/constants';
import {
  chatWithCoach,
  getMorningBriefing,
  getTradeSignal,
  getWeeklyReview,
  rateLimitManager,
} from '../lib/groq';

const CHAT_KEY_PREFIX = 'ai_coach_history';
const MAX_MESSAGES = 50;

const safeParse = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const timeLabel = (date = new Date()) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);

const toMessage = (role, content) => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  createdAt: new Date().toISOString(),
  timeLabel: timeLabel(),
});

export default function AICoachScreen({ userId }) {
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(0);

  const chatKey = useMemo(() => `${CHAT_KEY_PREFIX}_${userId || 'guest'}`, [userId]);

  useEffect(() => {
    const load = async () => {
      const raw = await AsyncStorage.getItem(chatKey);
      const parsed = safeParse(raw, []);
      setMessages(parsed);
      const dayUsage = await rateLimitManager.getDailyUsage();
      setUsage(dayUsage);
    };
    load();
  }, [chatKey]);

  const persistMessages = async (next) => {
    const pruned = next.slice(-MAX_MESSAGES);
    setMessages(pruned);
    await AsyncStorage.setItem(chatKey, JSON.stringify(pruned));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const runAI = async (runner, label) => {
    setLoading(true);
    const pending = [...messages, toMessage('assistant', `Analyzing ${label}...`)];
    await persistMessages(pending);
    const result = await runner();
    const cleaned = pending.slice(0, -1);
    await persistMessages([
      ...cleaned,
      toMessage('assistant', result?.content || 'No response. Please retry.'),
    ]);
    setLoading(false);
    const dayUsage = await rateLimitManager.getDailyUsage();
    setUsage(dayUsage);
  };

  const onSend = async () => {
    const value = input.trim();
    if (!value || loading) return;
    const userMsg = toMessage('user', value);
    const history = [...messages, userMsg];
    setInput('');
    await persistMessages(history);
    setLoading(true);
    const result = await chatWithCoach(
      userId,
      history.map((m) => ({ role: m.role, content: m.content })),
      value
    );
    await persistMessages([...history, toMessage('assistant', result.content)]);
    setLoading(false);
    const dayUsage = await rateLimitManager.getDailyUsage();
    setUsage(dayUsage);
  };

  const onClear = async () => {
    await AsyncStorage.removeItem(chatKey);
    setMessages([]);
  };

  const onLongPressMessage = (message) => {
    Alert.alert('Message', message.content);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤖 AI Coach</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClear}>
            <Text style={styles.headerBtnTxt}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.usageText}>Today’s AI usage: {usage} / 14400</Text>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={{ paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask anything about your GFT trading plan.</Text>
            <Text style={styles.emptySub}>Use quick actions below to start fast.</Text>
          </View>
        ) : null}
        {messages.map((message) => (
          <AIMessageCard key={message.id} message={message} onLongPress={onLongPressMessage} />
        ))}
        {loading ? <AITypingIndicator /> : null}
      </ScrollView>

      <View style={styles.quickRow}>
        <TouchableOpacity
          style={styles.quickBtn}
          disabled={loading}
          onPress={() => runAI(() => getMorningBriefing(userId), 'morning briefing')}
        >
          <Text style={styles.quickTxt}>☀️ Brief</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          disabled={loading}
          onPress={() => runAI(() => getTradeSignal(userId), 'trade signal')}
        >
          <Text style={styles.quickTxt}>📊 Signal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          disabled={loading}
          onPress={() => runAI(() => getWeeklyReview(userId), 'weekly review')}
        >
          <Text style={styles.quickTxt}>📓 Review</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type your question..."
          placeholderTextColor={C.muted}
          editable={!loading}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={onSend} disabled={loading}>
          <Text style={styles.sendTxt}>▶</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingTop: 50,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', gap: 8 },
  headerBtn: {
    backgroundColor: C.card2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBtnTxt: { color: C.muted, fontSize: 12, fontWeight: '700' },
  usageText: { color: C.muted, fontSize: 11, paddingHorizontal: 14, paddingBottom: 6 },
  chat: { flex: 1 },
  empty: {
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: 14,
  },
  emptyTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  emptySub: { color: C.muted, fontSize: 12, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  quickBtn: {
    flex: 1,
    backgroundColor: C.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickTxt: { color: C.text, fontSize: 12, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 48,
    borderRadius: 10,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendTxt: { color: '#000', fontSize: 20, fontWeight: '900' },
});
