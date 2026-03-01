import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ActiveTradeBanner from '../components/ActiveTradeBanner';
import { C } from '../lib/constants';

export default function ActiveTradeScreen({ liveTrade, onCloseEarly, onHitOutcome }) {
  return (
    <View style={styles.container}>
      <ActiveTradeBanner liveTrade={liveTrade} />
      <View style={styles.card}>
        <Text style={styles.title}>🤖 AI says</Text>
        <Text style={styles.txt}>
          {liveTrade?.estimatedPnL >= 0
            ? 'Trade is moving in your favor. Stay calm and let setup work.'
            : 'Trade is currently negative. Do not panic; SL is your protection.'}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>⚠️ Remember</Text>
        <Text style={styles.txt}>• Do not change lot size.
{`\n`}• Keep SL and TP intact.
{`\n`}• Close before red-news danger windows.</Text>
      </View>
      <TouchableOpacity style={[styles.btn, { backgroundColor: C.orange }]} onPress={onCloseEarly}><Text style={styles.btnTxt}>🚪 I Closed Trade Early</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.btn, { backgroundColor: C.green }]} onPress={onHitOutcome}><Text style={[styles.btnTxt, { color: '#000' }]}>✅ Trade Hit TP or SL</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 40 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12 },
  title: { color: C.text, fontWeight: '900', marginBottom: 8 },
  txt: { color: C.text, lineHeight: 20, fontSize: 13 },
  btn: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '900' },
});
