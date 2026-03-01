import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function ActiveTradeBanner({ liveTrade }) {
  if (!liveTrade) return null;
  const up = Number(liveTrade.estimatedPnL || 0) >= 0;
  return (
    <View style={[styles.card, { borderLeftColor: up ? C.green : C.red }]}> 
      <Text style={styles.title}>✅ TRADE ACTIVE — EUR/USD {liveTrade.direction}</Text>
      <Text style={[styles.pnl, { color: up ? C.green : C.red }]}>{up ? '+' : ''}${liveTrade.estimatedPnL}</Text>
      <Text style={styles.txt}>Current: {liveTrade.currentPrice}</Text>
      <Text style={styles.txt}>To TP: {liveTrade.distanceToTP} pips · To SL: {liveTrade.distanceToSL} pips</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12, borderLeftWidth: 4 },
  title: { color: C.text, fontSize: 14, fontWeight: '900' },
  pnl: { fontSize: 28, fontWeight: '900', marginTop: 8 },
  txt: { color: C.muted, marginTop: 4, fontSize: 12 },
});
