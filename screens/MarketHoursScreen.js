import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../lib/constants';
import { getNextMarketOpen, getTradingRecommendation, getWeekSchedule, isMarketOpen } from '../engine/marketHours';

export default function MarketHoursScreen({ onBack }) {
  const [market, setMarket] = useState(isMarketOpen());
  const [recommendation, setRecommendation] = useState(null);
  const [nextOpen, setNextOpen] = useState(getNextMarketOpen());

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rec = await getTradingRecommendation().catch(() => null);
      if (!mounted) return;
      setMarket(isMarketOpen());
      setNextOpen(getNextMarketOpen());
      setRecommendation(rec);
    };

    load();
    const interval = setInterval(load, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const week = getWeekSchedule();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 110 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Market Hours</Text>
      </View>

      <View style={[styles.card, { borderLeftColor: market.isOpen ? C.green : C.red, borderLeftWidth: 4 }]}>
        <Text style={[styles.status, { color: market.isOpen ? C.green : C.red }]}>{market.isOpen ? '🟢 MARKET OPEN' : '🔴 MARKET CLOSED'}</Text>
        <Text style={styles.info}>{market.sessionLabel}</Text>
        {!market.isOpen && <Text style={styles.info}>Opens in: {nextOpen.countdown}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What To Do Now</Text>
        <Text style={[styles.info, { color: recommendation?.color || C.text }]}>{recommendation?.emoji} {recommendation?.headline}</Text>
        <Text style={styles.sub}>{recommendation?.reason || 'Loading recommendation...'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>This Week Schedule (IST)</Text>
        {week.map((d) => (
          <View key={d.label} style={[styles.row, d.isToday && { borderColor: C.green }]}> 
            <Text style={[styles.day, d.isToday && { color: C.green }]}>{d.label}</Text>
            <Text style={styles.win}>{d.windows}</Text>
            <Text style={[styles.qual, { color: d.quality === 'best' ? C.green : d.quality === 'closed' ? C.muted : C.yellow }]}>{d.quality.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingTop: 50 },
  back: { color: C.blue, fontWeight: '800' },
  title: { color: C.text, fontWeight: '900', fontSize: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginHorizontal: 12, marginTop: 10 },
  status: { fontSize: 16, fontWeight: '900' },
  info: { color: C.text, marginTop: 6, fontSize: 13, fontWeight: '700' },
  sub: { color: C.muted, marginTop: 5, fontSize: 12 },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, marginBottom: 8 },
  day: { color: C.text, width: 46, fontWeight: '800' },
  win: { color: C.text, flex: 1, fontSize: 12 },
  qual: { fontWeight: '800', fontSize: 11 },
});
