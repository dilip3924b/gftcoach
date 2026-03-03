import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getAllPrices } from '../lib/priceFeeds';
import { getActiveTradePnL } from '../lib/groq';

const C = { bg: '#080D1A', card: '#0F1826', green: '#00FFB0', red: '#FF3B5C', yellow: '#FFD60A', text: '#FFF', sub: '#94A3B8', border: '#1E293B' };

const symbolOf = (trade) => {
  const s = String(trade?.symbol || trade?.pair || 'EURUSD').replace('/', '').toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return 'XAUUSD';
  if (s.includes('BTC')) return 'BTCUSD';
  return 'EURUSD';
};

export default function ActiveTradeScreen({ liveTrade, onCloseEarly, onHitOutcome, route, navigation }) {
  const routeTrade = route?.params?.trade || null;
  const trade = routeTrade || liveTrade;

  const [latest, setLatest] = useState(trade || null);
  const [advice, setAdvice] = useState('Monitoring your trade...');
  const [manualPrice, setManualPrice] = useState('');

  useEffect(() => {
    setLatest(trade || null);
  }, [trade]);

  useEffect(() => {
    let canceled = false;

    const refresh = async () => {
      const symbol = symbolOf(latest || trade || {});
      const prices = await getAllPrices().catch(() => null);
      const quote = prices?.[symbol];
      if (!quote) return;

      const entry = Number(latest?.entry_price || trade?.entry_price || 0);
      const dir = String(latest?.direction || trade?.direction || 'BUY').toUpperCase();
      const pipSize = symbol === 'EURUSD' ? 0.0001 : 1;
      const unitValue = symbol === 'EURUSD' ? 0.1 : 0.01;
      const current = dir === 'BUY' ? Number(quote.bid) : Number(quote.ask);
      const delta = dir === 'BUY' ? (current - entry) / pipSize : (entry - current) / pipSize;
      const pnl = Number((delta * unitValue).toFixed(2));

      const enriched = {
        ...(latest || trade),
        symbol,
        currentPrice: current,
        deltaPips: Number(delta.toFixed(1)),
        estimatedPnL: pnl,
        distanceToTP: Number(Math.abs((Number(trade?.take_profit || 0) - current) / pipSize).toFixed(1)),
        distanceToSL: Number(Math.abs((current - Number(trade?.stop_loss || 0)) / pipSize).toFixed(1)),
        updatedAt: new Date().toISOString(),
      };
      if (!canceled) setLatest(enriched);

      const ai = await getActiveTradePnL(
        symbol,
        dir,
        entry,
        Number(trade?.stop_loss || 0),
        Number(trade?.take_profit || 0),
        current,
        pnl
      ).catch(() => null);
      if (!canceled && ai?.content) setAdvice(ai.content);
    };

    refresh();
    const id = setInterval(refresh, 30000);
    return () => {
      canceled = true;
      clearInterval(id);
    };
  }, [trade]);

  if (!trade) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: C.sub }}>No active trade.</Text>
      </View>
    );
  }

  const symbol = symbolOf(trade);
  const direction = String(trade.direction || 'BUY').toUpperCase();
  const pipSize = symbol === 'EURUSD' ? 0.0001 : 1;
  const entry = Number(trade.entry_price || 0);
  const sl = Number(trade.stop_loss || 0);
  const tp = Number(trade.take_profit || 0);
  const slUnits = Math.round(Math.abs(entry - sl) / pipSize);
  const tpUnits = Math.round(Math.abs(tp - entry) / pipSize);
  const unitValue = symbol === 'EURUSD' ? 0.1 : 0.01;

  const progress = (() => {
    const current = Number(latest?.currentPrice || entry);
    if (!current) return 50;
    if (direction === 'BUY') {
      return Math.max(0, Math.min(100, ((current - sl) / (tp - sl || 1)) * 100));
    }
    return Math.max(0, Math.min(100, ((sl - current) / (sl - tp || 1)) * 100));
  })();

  const onManual = () => {
    if (!manualPrice) return;
    if (onHitOutcome) {
      return onHitOutcome({
        type: 'MANUAL',
        closePrice: Number(manualPrice),
      });
    }
    if (onCloseEarly) return onCloseEarly({ type: 'MANUAL', closePrice: Number(manualPrice) });
    Alert.alert('Logged', 'Manual close captured.');
    navigation?.goBack?.();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={[styles.card, { borderColor: Number(latest?.estimatedPnL || 0) >= 0 ? C.green : C.red, borderWidth: 1 }]}> 
        <Text style={styles.cardTitle}>✅ TRADE ACTIVE</Text>
        <Text style={[styles.h2, { color: direction === 'BUY' ? C.green : C.red }]}>{symbol} {direction}</Text>
        <Text style={styles.sub}>Entry: {entry} · Lot: 0.01 · Estimated P&L</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>💰 LIVE ESTIMATED P&L</Text>
        <Text style={[styles.bigPnl, { color: Number(latest?.estimatedPnL || 0) >= 0 ? C.green : C.red }]}>
          {Number(latest?.estimatedPnL || 0) >= 0 ? '+' : ''}${Number(latest?.estimatedPnL || 0).toFixed(2)}
        </Text>
        <Text style={[styles.sub, { textAlign: 'center' }]}>{Math.abs(Number(latest?.deltaPips || 0)).toFixed(1)} {symbol === 'EURUSD' ? 'pips' : 'dollar move'} from entry</Text>

        <View style={{ marginTop: 12 }}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: progress > 60 ? C.green : progress > 30 ? C.yellow : C.red }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={styles.hint}>SL {sl}</Text>
            <Text style={[styles.hint, { color: C.green }]}>TP {tp}</Text>
          </View>
        </View>

        <Row label="Current" value={Number(latest?.currentPrice || 0) ? String(latest.currentPrice) : '...'} />
        <Row label="Distance to TP" value={`${Number(latest?.distanceToTP || tpUnits)} ${symbol === 'EURUSD' ? 'pips' : '$'}`} valueColor={C.green} />
        <Row label="Distance to SL" value={`${Number(latest?.distanceToSL || slUnits)} ${symbol === 'EURUSD' ? 'pips' : '$'}`} valueColor={C.red} />
      </View>

      <View style={[styles.card, { backgroundColor: '#0A1628' }]}>
        <Text style={styles.cardTitle}>🤖 AI SAYS</Text>
        <Text style={styles.body}>{advice}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔚 CLOSE TRADE</Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.green }]}
          onPress={() => onHitOutcome?.({ type: 'TP' })}
        >
          <Text style={styles.btnText}>✅ Take Profit Hit (+${(tpUnits * unitValue).toFixed(2)})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.red, marginTop: 10 }]}
          onPress={() => onHitOutcome?.({ type: 'SL' })}
        >
          <Text style={[styles.btnText, { color: '#FFF' }]}>❌ Stop Loss Hit (-${(slUnits * unitValue).toFixed(2)})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.card, marginTop: 10, borderWidth: 1, borderColor: C.border }]}
          onPress={() => onCloseEarly?.({ type: 'EARLY' })}
        >
          <Text style={[styles.btnText, { color: '#FFF' }]}>🚪 Close Trade Now</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Enter manual close price"
          placeholderTextColor="#475569"
          keyboardType="decimal-pad"
          value={manualPrice}
          onChangeText={setManualPrice}
        />
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.yellow, opacity: manualPrice ? 1 : 0.5 }]} disabled={!manualPrice} onPress={onManual}>
          <Text style={[styles.btnText, { color: '#000' }]}>Log Manual Close</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Estimated math uses ${unitValue.toFixed(2)} per {symbol === 'EURUSD' ? 'pip' : '$1 move'} at 0.01 lot.</Text>
      </View>
    </ScrollView>
  );
}

const Row = ({ label, value, valueColor }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
    <Text style={{ color: C.sub, fontSize: 14 }}>{label}</Text>
    <Text style={{ color: valueColor || C.text, fontSize: 14, fontWeight: '600' }}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.sub, letterSpacing: 1, marginBottom: 8 },
  h2: { fontSize: 22, fontWeight: '700', color: C.text },
  sub: { fontSize: 13, color: C.sub, marginTop: 4 },
  body: { fontSize: 14, color: '#CBD5E1', lineHeight: 22, marginTop: 4 },
  hint: { fontSize: 12, color: '#64748B', marginTop: 8 },
  bigPnl: { fontSize: 42, fontWeight: '900', textAlign: 'center', marginVertical: 8 },
  btn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#080D1A', fontWeight: '700', fontSize: 15 },
  input: { backgroundColor: '#1E293B', borderRadius: 10, padding: 14, color: '#FFF', fontSize: 16, marginTop: 10 },
  progressBg: { height: 8, backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
