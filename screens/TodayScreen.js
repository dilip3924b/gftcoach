import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ActiveTradeBanner from '../components/ActiveTradeBanner';
import DailyPlanCard from '../components/DailyPlanCard';
import DangerBanner from '../components/DangerBanner';
import GoalPaceCard from '../components/GoalPaceCard';
import SignalCard from '../components/SignalCard';
import { C } from '../lib/constants';
import { getCurrentTradingSession, getEconomicCalendar, getLiveForexPrices, isCurrentlyDangerZone } from '../lib/api';
import { getMorningBriefing } from '../lib/groq';
import { getNextMarketOpen, isMarketOpen } from '../engine/marketHours';

export default function TodayScreen({
  userId,
  activeSignal,
  liveTrade,
  todayPL,
  totalProfit,
  pacing,
  scanStatus,
  onOpenSignal,
  onOpenAssetSelect,
  onOpenAI,
  onOpenChart,
  onManualScan,
}) {
  const [session, setSession] = useState(getCurrentTradingSession());
  const [briefing, setBriefing] = useState('Loading briefing...');
  const [briefSlot, setBriefSlot] = useState('');
  const [price, setPrice] = useState(null);
  const [danger, setDanger] = useState({ isDanger: false });
  const [calendar, setCalendar] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const market = isMarketOpen();
  const nextOpen = getNextMarketOpen();

  const getIstSlot = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const slot = h >= 18 ? '18' : h >= 13 ? '13' : h >= 9 ? '09' : 'pre';
    return `${y}-${m}-${d}-${slot}`;
  };

  const formatFreshness = (timestamp) => {
    if (!timestamp) return 'unknown';
    const sec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    return `${sec}s ago`;
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [prices, d, cal, brief] = await Promise.all([
      getLiveForexPrices().catch(() => null),
      isCurrentlyDangerZone().catch(() => ({ isDanger: false })),
      getEconomicCalendar().catch(() => []),
      getMorningBriefing(userId).catch(() => ({ content: 'Briefing unavailable right now.' })),
    ]);
    setSession(getCurrentTradingSession());
    setPrice(prices?.EURUSD || null);
    setDanger(d);
    setCalendar(cal || []);
    setBriefing(brief?.content || 'Briefing unavailable right now.');
    setBriefSlot(getIstSlot());
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    const priceInt = setInterval(async () => {
      const prices = await getLiveForexPrices().catch(() => null);
      setSession(getCurrentTradingSession());
      setPrice(prices?.EURUSD || null);
    }, 30000);
    const briefingInt = setInterval(async () => {
      const slotNow = getIstSlot();
      if (slotNow === briefSlot) return;
      const brief = await getMorningBriefing(userId).catch(() => ({ content: 'Briefing unavailable right now.' }));
      setBriefing(brief?.content || 'Briefing unavailable right now.');
      setBriefSlot(slotNow);
    }, 60000);
    return () => {
      clearInterval(priceInt);
      clearInterval(briefingInt);
    };
  }, [briefSlot, userId, refresh]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { await refresh(); await onManualScan?.(); }} />}
    >
      {!market.isOpen && (
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: C.red }]}>
          <Text style={[styles.cardTitle, { color: C.red }]}>🔴 Market Closed</Text>
          <Text style={styles.marketLine}>Opens: {nextOpen.opensAtIST}</Text>
          <Text style={styles.marketSub}>Countdown: {nextOpen.countdown}</Text>
        </View>
      )}

      <DailyPlanCard session={session} briefing={briefing} />
      <DangerBanner danger={danger} />

      {liveTrade ? (
        <ActiveTradeBanner liveTrade={liveTrade} />
      ) : (
        <SignalCard signal={activeSignal} onPress={onOpenSignal} />
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📡 Live Market</Text>
        <Text style={styles.marketLine}>EUR/USD {price?.bid?.toFixed?.(5) || '—'} {price?.changePct ? `${price.changePct}%` : ''}</Text>
        <Text style={styles.marketSub}>Spread: {price?.spread ?? '—'} pips · Updated {formatFreshness(price?.updatedAt || price?.timestamp)}</Text>
        <Text style={styles.marketSub}>Status: {market.isOpen ? scanStatus : 'market_closed'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Today’s Danger Zones</Text>
        {calendar.length === 0 ? (
          <Text style={styles.safe}>✅ No high-impact events found today.</Text>
        ) : (
          calendar.slice(0, 3).map((ev) => (
            <View key={ev.id} style={styles.evRow}>
              <Text style={styles.evTitle}>🔴 {ev.time} — {ev.event}</Text>
              <Text style={styles.evSub}>Avoid: {new Date(ev.dangerWindowStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - {new Date(ev.dangerWindowEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</Text>
            </View>
          ))
        )}
      </View>

      <GoalPaceCard pacing={pacing} todayPL={todayPL} totalProfit={totalProfit} />

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenAssetSelect}><Text style={styles.actionTxt}>🧭 Choose Asset</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenAI}><Text style={styles.actionTxt}>🤖 Ask AI Coach</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenChart}><Text style={styles.actionTxt}>📊 Open Chart</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, margin: 12 },
  cardTitle: { color: C.text, fontWeight: '900', fontSize: 15, marginBottom: 8 },
  marketLine: { color: C.text, fontSize: 18, fontWeight: '900' },
  marketSub: { color: C.muted, fontSize: 12, marginTop: 4 },
  safe: { color: C.green, fontWeight: '700', fontSize: 13 },
  evRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  evTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  evSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginHorizontal: 12 },
  actionBtn: { flex: 1, backgroundColor: C.card2, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  actionTxt: { color: C.text, fontWeight: '800', fontSize: 12 },
});
