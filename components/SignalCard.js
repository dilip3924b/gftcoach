import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/constants';
import ConfidenceMeter from './ConfidenceMeter';

export default function SignalCard({ signal, onPress }) {
  if (!signal) return null;
  const color = signal.signal === 'BUY' ? C.green : signal.signal === 'SELL' ? C.red : C.yellow;
  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: color }]} onPress={onPress}>
      <Text style={[styles.title, { color }]}>🎯 ACTIVE SIGNAL: {signal.signal}</Text>
      <Text style={styles.txt}>EUR/USD {signal.signal}</Text>
      <Text style={styles.txt}>Entry: {signal.entry?.range || 'N/A'}</Text>
      <ConfidenceMeter confidence={signal.confidence || 'LOW'} />
      <Text style={styles.link}>See Full Signal & MT5 Instructions</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12, borderLeftWidth: 4 },
  title: { fontSize: 15, fontWeight: '900' },
  txt: { color: C.text, fontSize: 13, marginTop: 4 },
  link: { color: C.blue, marginTop: 8, fontWeight: '700' },
});
