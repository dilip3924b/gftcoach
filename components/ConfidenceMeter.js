import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../lib/constants';

export default function ConfidenceMeter({ confidence = 'LOW' }) {
  const pct = confidence === 'HIGH' ? 90 : confidence === 'MEDIUM' ? 65 : confidence === 'LOW' ? 40 : 20;
  const color = confidence === 'HIGH' ? C.green : confidence === 'MEDIUM' ? C.yellow : C.red;
  return (
    <View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.label, { color }]}>{confidence}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, backgroundColor: C.border, borderRadius: 8, overflow: 'hidden' },
  fill: { height: '100%' },
  label: { marginTop: 4, fontSize: 11, fontWeight: '800' },
});
