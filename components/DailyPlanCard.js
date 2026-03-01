import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function DailyPlanCard({ session, briefing }) {
  return (
    <View style={[styles.card, { borderLeftColor: session?.color || C.green }]}> 
      <Text style={styles.date}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</Text>
      <Text style={[styles.session, { color: session?.color || C.green }]}>{session?.label || 'Session unavailable'}</Text>
      <Text style={styles.advice}>{session?.advice || 'Open app near overlap session for best setups.'}</Text>
      <Text style={styles.briefing}>{briefing || 'Morning briefing not loaded yet.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12, borderLeftWidth: 4 },
  date: { color: C.muted, fontSize: 12 },
  session: { marginTop: 8, fontSize: 16, fontWeight: '900' },
  advice: { color: C.text, marginTop: 6, fontSize: 12 },
  briefing: { color: C.muted, marginTop: 8, fontSize: 12, lineHeight: 18 },
});
