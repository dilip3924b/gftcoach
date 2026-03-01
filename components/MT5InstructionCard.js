import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/constants';

const stepsBase = [
  'Open MT5 app',
  'Find EUR/USD in Quotes',
  'Tap EUR/USD and open New Order',
  'Set Volume to 0.01',
  'Set Stop Loss using value below',
  'Set Take Profit using value below',
  'Tap BUY or SELL as instructed',
];

export default function MT5InstructionCard({ signal, onDone }) {
  const [done, setDone] = useState({});
  const allDone = useMemo(() => stepsBase.every((_, i) => done[i]), [done]);

  const toggle = (i) => setDone((prev) => ({ ...prev, [i]: !prev[i] }));
  const copy = async (v) => Clipboard.setStringAsync(String(v));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📋 MT5 Step-by-Step</Text>
      {stepsBase.map((step, i) => (
        <TouchableOpacity key={step} style={styles.stepRow} onPress={() => toggle(i)}>
          <Text style={styles.check}>{done[i] ? '✅' : '⬜'}</Text>
          <Text style={styles.stepTxt}>Step {i + 1}: {step}</Text>
        </TouchableOpacity>
      ))}

      <View style={styles.copyRow}>
        <Text style={styles.copyTxt}>Volume: 0.01</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={() => copy('0.01')}><Text style={styles.copyBtnTxt}>Copy</Text></TouchableOpacity>
      </View>
      <View style={styles.copyRow}>
        <Text style={styles.copyTxt}>Stop Loss: {signal?.stopLoss?.price ?? '-'}</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={() => copy(signal?.stopLoss?.price ?? '')}><Text style={styles.copyBtnTxt}>Copy</Text></TouchableOpacity>
      </View>
      <View style={styles.copyRow}>
        <Text style={styles.copyTxt}>Take Profit: {signal?.takeProfit?.price ?? '-'}</Text>
        <TouchableOpacity style={styles.copyBtn} onPress={() => copy(signal?.takeProfit?.price ?? '')}><Text style={styles.copyBtnTxt}>Copy</Text></TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.doneBtn, { opacity: allDone ? 1 : 0.5 }]}
        disabled={!allDone}
        onPress={onDone}
      >
        <Text style={styles.doneTxt}>🚀 I PLACED THE TRADE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '900', marginBottom: 8 },
  stepRow: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  check: { fontSize: 20 },
  stepTxt: { color: C.text, flex: 1, fontSize: 13 },
  copyRow: { backgroundColor: C.card2, borderRadius: 10, padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  copyTxt: { color: C.text, flex: 1, fontWeight: '700', fontSize: 13 },
  copyBtn: { borderWidth: 1, borderColor: C.blue, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnTxt: { color: C.blue, fontWeight: '800' },
  doneBtn: { backgroundColor: C.green, borderRadius: 10, padding: 12, marginTop: 12, alignItems: 'center' },
  doneTxt: { color: '#000', fontWeight: '900' },
});
