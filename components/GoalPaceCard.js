import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function GoalPaceCard({ pacing, todayPL, totalProfit }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🏆 Goal Pace</Text>
      <Text style={styles.big}>${Number(totalProfit || 0).toFixed(2)} / $100</Text>
      <Text style={styles.small}>Today: ${Number(todayPL || 0).toFixed(2)} · {pacing?.daysRemaining} days left</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pacing?.percentComplete || 0))}%` }]} /></View>
      <Text style={styles.msg}>{pacing?.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12 },
  title: { color: C.text, fontSize: 15, fontWeight: '900' },
  big: { color: C.green, fontSize: 24, fontWeight: '900', marginTop: 8 },
  small: { color: C.muted, fontSize: 12, marginTop: 4 },
  track: { backgroundColor: C.border, height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', backgroundColor: C.green },
  msg: { color: C.text, marginTop: 8, fontSize: 12 },
});
