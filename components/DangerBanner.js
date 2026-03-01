import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function DangerBanner({ danger }) {
  if (!danger?.isDanger) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🚨 DANGER ZONE ACTIVE</Text>
      <Text style={styles.body}>{danger.event || 'High-impact event'} · Safe in {danger.minutesUntilSafe} min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { margin: 12, backgroundColor: '#3f111c', borderColor: C.red, borderWidth: 1, borderRadius: 12, padding: 12 },
  title: { color: C.red, fontWeight: '900', fontSize: 13 },
  body: { color: '#ffd5dd', marginTop: 4, fontSize: 12 },
});
