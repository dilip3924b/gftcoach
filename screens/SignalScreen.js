import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfidenceMeter from '../components/ConfidenceMeter';
import MT5InstructionCard from '../components/MT5InstructionCard';
import { C } from '../lib/constants';
import { useEntryWindow } from '../hooks/useEntryWindow';
import { askAboutSignal } from '../lib/groq';
import { notificationEngine } from '../engine/notificationEngine';
import { db } from '../lib/db';

const alpha = (hex, op) => `${hex}${op}`;

export default function SignalScreen({
  signal,
  onPlacedTrade,
  onBack,
  onOpenThinking,
  userId,
  scanStatus = 'waiting',
  lastScanAt = null,
  nextScanAt = null,
  noSignalReason = '',
  lastScanResults = [],
}) {
  const { entryStatus, loading } = useEntryWindow(signal);
  const [question, setQuestion] = React.useState('');
  const [aiReply, setAiReply] = React.useState('');
  const [asking, setAsking] = React.useState(false);
  const [, setTick] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    notificationEngine.cancelEntryWindowWarnings().catch(() => {});
    if (signal?.id) {
      const now = new Date().toISOString();
      db.updateSignalEntryTracking(signal.id, { user_opened_at: now }).catch(() => {});
    }
  }, [signal?.id]);

  React.useEffect(() => {
    if (signal?.id && entryStatus?.window) {
      db.updateSignalEntryTracking(signal.id, { user_entry_window: entryStatus.window }).catch(() => {});
    }
  }, [signal?.id, entryStatus?.window]);

  if (!signal) {
    const nowMs = Date.now();
    const nextMs = nextScanAt ? new Date(nextScanAt).getTime() : null;
    const secs = nextMs ? Math.max(0, Math.floor((nextMs - nowMs) / 1000)) : null;
    const mm = secs != null ? String(Math.floor(secs / 60)).padStart(2, '0') : '--';
    const ss = secs != null ? String(secs % 60).padStart(2, '0') : '--';

    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.card, { width: '92%', borderLeftWidth: 4, borderLeftColor: C.yellow }]}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>No active signal yet</Text>
          <Text style={[styles.txt, { marginTop: 8 }]}>Scanner status: {scanStatus}</Text>
          <Text style={styles.txt}>Last scan: {lastScanAt ? new Date(lastScanAt).toLocaleTimeString('en-IN') : 'Not scanned yet'}</Text>
          <Text style={styles.txt}>Next scan in: {mm}:{ss}</Text>
          <Text style={[styles.txt, { marginTop: 8 }]}>Reason: {noSignalReason || 'Waiting for valid setup (session, spread, danger checks).'}</Text>
          {Array.isArray(lastScanResults) && lastScanResults.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.cardTitle, { marginBottom: 4 }]}>Last scan scores</Text>
              {lastScanResults.slice(0, 3).map((row) => (
                <Text key={row.symbol} style={styles.txt}>
                  • {row.symbol}: {row.confidenceScore ?? row.technicalScore ?? 'N/A'}/100 {row.waitReason ? `(${row.waitReason})` : ''}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  const color = signal.signal === 'BUY' ? C.green : signal.signal === 'SELL' ? C.red : C.yellow;
  const windowColor = entryStatus?.window === 'immediate'
    ? C.green
    : entryStatus?.window === 'extended'
      ? C.yellow
      : entryStatus?.window === 'late'
        ? C.orange
        : C.muted;
  const numbers = entryStatus?.canStillEnter
    ? {
        entry: entryStatus?.currentEntry?.price,
        sl: entryStatus?.adjustedSL,
        tp: entryStatus?.adjustedTP,
      }
    : {
        entry: signal.entry?.price,
        sl: signal.stopLoss?.price,
        tp: signal.takeProfit?.price,
      };
  const distanceUnit = signal?.symbol === 'EURUSD' ? 'pips' : 'dollar move';

  const runAsk = async (text) => {
    if (!text?.trim()) return;
    setAsking(true);
    const result = await askAboutSignal(signal, entryStatus || {}, text.trim()).catch(() => null);
    setAiReply(result?.content || 'Could not fetch AI advice right now.');
    setAsking(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>{signal?.symbol || 'EURUSD'} SIGNAL</Text>
      </View>

      <View style={[styles.windowCard, { borderColor: windowColor, backgroundColor: alpha(windowColor, '20') }]}>
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={C.text} size="small" />
            <Text style={styles.windowTitle}>Evaluating live entry window...</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.windowTitle, { color: windowColor }]}>
              {entryStatus?.window === 'immediate' && '⚡ RIGHT NOW - Enter Immediately'}
              {entryStatus?.window === 'extended' && `🟡 YOU CAN STILL ENTER (${entryStatus?.countdownDisplay})`}
              {entryStatus?.window === 'late' && '⚠️ LATE ENTRY - Caution'}
              {entryStatus?.window === 'expired' && '❌ SIGNAL EXPIRED'}
            </Text>
            {entryStatus?.canStillEnter ? (
              <>
                <Text style={styles.windowTxt}>Price moved {entryStatus?.pipsFromOriginal || 0} {distanceUnit}. Use updated numbers:</Text>
                <Text style={styles.windowNums}>Entry {numbers.entry} · SL {numbers.sl} · TP {numbers.tp}</Text>
                <Text style={styles.windowNums}>Risk ${entryStatus?.riskIfEnterNow} · Reward ${entryStatus?.rewardIfEnterNow} · R:R 1:{entryStatus?.rrRatio}</Text>
              </>
            ) : (
              <Text style={styles.windowTxt}>This setup is no longer valid. Wait for the next signal.</Text>
            )}
            {!!entryStatus?.aiGuidance && <Text style={styles.aiHint}>🤖 {entryStatus.aiGuidance}</Text>}
          </>
        )}
      </View>

      <View style={[styles.card, { borderLeftColor: color }]}> 
        <Text style={[styles.signal, { color }]}>{signal.signal} SIGNAL</Text>
        <Text style={styles.valid}>Valid for: {signal.validUntilMinutes || 45} minutes</Text>
        {!!signal?.demoMode && <Text style={styles.demoWarn}>⚠️ Demo Mode: {signal?.demoNote}</Text>}
        <ConfidenceMeter confidence={signal.confidence || 'LOW'} />
        {!!(signal?.thinkingReport || signal?.thinking_report) && (
          <TouchableOpacity style={styles.thinkBtn} onPress={onOpenThinking}>
            <Text style={styles.thinkTxt}>🤖 How did AI decide?</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>💡 What This Means</Text>
        <Text style={styles.txt}>{signal.simpleExplanation || signal.waitReason || 'Follow the setup exactly with 0.01 lots.'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Signal Details</Text>
        <Text style={styles.txt}>Entry Zone: {entryStatus?.currentEntry?.range || signal.entry?.range}</Text>
        <Text style={styles.txt}>Stop Loss: {numbers.sl} ({entryStatus?.adjustedSlPips || signal.stopLoss?.pips} {distanceUnit})</Text>
        <Text style={styles.txt}>Take Profit: {numbers.tp} ({entryStatus?.adjustedTpPips || signal.takeProfit?.pips} {distanceUnit})</Text>
        <Text style={styles.txt}>Lot Size: 0.01</Text>
        <Text style={styles.txt}>Max Loss: ${entryStatus?.riskIfEnterNow || signal.stopLoss?.maxLoss} · Potential Gain: ${entryStatus?.rewardIfEnterNow || signal.takeProfit?.potentialGain}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>💬 Ask About This Signal</Text>
        <View style={styles.quickRow}>
          {['Should I still enter?', "What's my risk?", 'What if it goes wrong?'].map((q) => (
            <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => setQuestion(q)}>
              <Text style={styles.quickTxt}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.askRow}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Type your question"
            style={styles.input}
          />
          <TouchableOpacity style={styles.askBtn} onPress={() => runAsk(question)} disabled={asking}>
            <Text style={styles.askBtnTxt}>{asking ? '...' : 'Ask'}</Text>
          </TouchableOpacity>
        </View>
        {!!aiReply && <Text style={styles.aiReply}>🤖 {aiReply}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✅ Why This Setup</Text>
        {(signal.reasons || []).slice(0, 4).map((r, i) => <Text key={i} style={styles.txt}>• {r}</Text>)}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚠️ Warnings</Text>
        {(signal.warnings || []).length === 0 ? <Text style={styles.txt}>No major warnings.</Text> : (signal.warnings || []).slice(0, 3).map((w, i) => <Text key={i} style={styles.txt}>• {w}</Text>)}
      </View>

      <MT5InstructionCard
        signal={{ ...signal, stopLoss: { ...signal.stopLoss, price: numbers.sl }, takeProfit: { ...signal.takeProfit, price: numbers.tp }, entry: { ...signal.entry, price: numbers.entry } }}
        onDone={() => onPlacedTrade?.(entryStatus)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingTop: 50 },
  back: { color: C.blue, fontWeight: '800' },
  title: { color: C.text, fontWeight: '900', fontSize: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12, borderLeftWidth: 4, borderLeftColor: C.border },
  windowCard: { borderRadius: 14, padding: 14, margin: 12, borderWidth: 1 },
  windowTitle: { color: C.text, fontWeight: '900', fontSize: 14 },
  windowTxt: { color: C.text, fontSize: 12, marginTop: 8, lineHeight: 18 },
  windowNums: { color: C.text, fontSize: 12, marginTop: 6, fontWeight: '700' },
  aiHint: { color: C.text, fontSize: 12, marginTop: 10, lineHeight: 18 },
  signal: { fontSize: 24, fontWeight: '900' },
  valid: { color: C.muted, marginTop: 4, marginBottom: 8 },
  cardTitle: { color: C.text, fontWeight: '900', fontSize: 15, marginBottom: 8 },
  txt: { color: C.text, fontSize: 13, lineHeight: 20, marginTop: 2 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  quickTxt: { color: C.text, fontSize: 11, fontWeight: '700' },
  askRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: C.text, fontSize: 12 },
  askBtn: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  askBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  aiReply: { color: C.text, marginTop: 10, lineHeight: 19, fontSize: 12 },
  thinkBtn: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.blue, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  thinkTxt: { color: C.blue, fontWeight: '800', fontSize: 12 },
  demoWarn: { color: C.orange, fontWeight: '700', marginTop: 6, fontSize: 12 },
});
