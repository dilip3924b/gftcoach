import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C, ASSET_PROFILES } from '../lib/constants';
import { getAllPrices } from '../lib/priceFeeds';
import { getAllAssetsNews } from '../lib/newsFeeds';
import { callGroqPrompt } from '../lib/groq';

const cardColor = (sentiment) => sentiment === 'bullish' ? C.green : sentiment === 'bearish' ? C.red : C.yellow;
const formatPct = (v) => (Number.isFinite(Number(v)) ? `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '');
const formatPrice = (code, v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'N/A';
  if (code === 'BTCUSD') return `$${Math.round(n).toLocaleString('en-IN')}`;
  if (code === 'XAUUSD') return `$${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toFixed(5);
};
const quoteOf = (asset) => {
  if (!asset) return null;
  if (Number.isFinite(Number(asset.bid))) return Number(asset.bid);
  if (Number.isFinite(Number(asset.mid))) return Number(asset.mid);
  return null;
};
const freshnessLabel = (ts) => {
  if (!ts) return 'unknown';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  return `${sec}s ago`;
};

export default function AssetSelectScreen({ onSelect, selectedSymbol, onBack }) {
  const [prices, setPrices] = useState(null);
  const [news, setNews] = useState(null);
  const [recommendation, setRecommendation] = useState('Loading AI recommendation...');

  const load = async () => {
      const [p, n] = await Promise.all([
        getAllPrices().catch(() => null),
        getAllAssetsNews().catch(() => null),
      ]);
      setPrices(p);
      setNews(n);

      if (p && n) {
        const ctx = `
EUR/USD: ${p.EURUSD?.bid} change ${p.EURUSD?.change24h}% sentiment ${n.EURUSD?.overallSentiment}
XAU/USD: ${p.XAUUSD?.bid} change ${p.XAUUSD?.change24h}% sentiment ${n.XAUUSD?.overallSentiment}
BTC/USD: ${p.BTCUSD?.bid} change ${p.BTCUSD?.change24h}% sentiment ${n.BTCUSD?.overallSentiment} fear/greed ${p.BTCUSD?.fearGreedIndex}/${p.BTCUSD?.fearGreedLabel}
`;
        const ai = await callGroqPrompt(
          'Recommend ONE best asset for a beginner today among EURUSD/XAUUSD/BTCUSD. Under 60 words.',
          ctx,
          180,
          0.2
        );
        setRecommendation(ai.content || 'No recommendation available.');
      } else {
        setRecommendation('Data unavailable right now. Please retry.');
      }
    };

  useEffect(() => {
    load();
  }, []);

  const rows = [
    { code: 'EURUSD', label: 'EUR/USD' },
    { code: 'XAUUSD', label: 'XAU/USD' },
    { code: 'BTCUSD', label: 'BTC/USD' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Choose Asset</Text>
      </View>

      <View style={styles.recoCard}>
        <Text style={styles.recoTitle}>🤖 AI Recommendation</Text>
        <Text style={styles.recoTxt}>{recommendation}</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={load}>
          <Text style={styles.refreshTxt}>↻ Refresh Prices</Text>
        </TouchableOpacity>
      </View>

      {rows.map((row) => {
        const p = prices?.[row.code];
        const n = news?.[row.code];
        const profile = ASSET_PROFILES[row.code];
        const q = quoteOf(p);
        return (
          <TouchableOpacity key={row.code} style={[styles.card, selectedSymbol === row.code && styles.active]} onPress={() => onSelect?.(row.code)}>
            <View style={styles.rowTop}>
              <Text style={styles.assetTitle}>{profile?.emoji} {row.label}</Text>
              {selectedSymbol === row.code && <Text style={styles.selected}>Selected</Text>}
            </View>
            <Text style={styles.priceLine}>{formatPrice(row.code, q)} {formatPct(p?.change24h ?? p?.changePct)}</Text>
            <Text style={styles.sub}>Spread: {p?.spread ?? 'N/A'} {p?.spreadUnit || ''} · Updated {freshnessLabel(p?.timestamp)}</Text>
            <Text style={styles.sub}>Source: {p?.source || 'unavailable'}</Text>
            <Text style={[styles.sentiment, { color: cardColor(n?.overallSentiment) }]}>Sentiment: {(n?.overallSentiment || 'neutral').toUpperCase()}</Text>
            {!p && <Text style={styles.demo}>Price feed unavailable. Pull to refresh.</Text>}
            {row.code === 'BTCUSD' && profile?.demoOnly && <Text style={styles.demo}>Demo mode: enable only if your account supports BTCUSD.</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingTop: 50 },
  back: { color: C.blue, fontWeight: '800' },
  title: { color: C.text, fontWeight: '900', fontSize: 16 },
  recoCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginHorizontal: 12, marginBottom: 10 },
  recoTitle: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  recoTxt: { color: C.text, lineHeight: 19, fontSize: 12 },
  refreshBtn: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border, backgroundColor: C.card2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  refreshTxt: { color: C.text, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  active: { borderColor: C.green },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetTitle: { color: C.text, fontWeight: '900', fontSize: 16 },
  selected: { color: C.green, fontSize: 11, fontWeight: '800' },
  priceLine: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 6 },
  sub: { color: C.muted, marginTop: 3, fontSize: 12 },
  sentiment: { fontWeight: '800', marginTop: 5, fontSize: 12 },
  demo: { color: C.orange, marginTop: 6, fontSize: 11 },
});
