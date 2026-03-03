import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationEngine } from './notificationEngine';
import { getAllPrices } from '../lib/priceFeeds';
import { analyzeAllNews } from './newsAnalyzer';
import { analyzeEURUSD } from './assets/eurusd';
import { analyzeXAUUSD } from './assets/xauusd';
import { analyzeBTCUSD } from './assets/btcusd';
import { generateMultiAssetSignal } from '../lib/groq';
import { buildTransparencyReport } from './transparencyEngine';
import { getEconomicCalendar } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getCandleHistory } from './candleSeeder';

const LAST_MULTI_KEY = 'latest_multi_signals';

const tickKey = (symbol) => `price_ticks_${symbol}`;

const saveTick = async (symbol, quote) => {
  const key = tickKey(symbol);
  const raw = await AsyncStorage.getItem(key);
  const ticks = raw ? JSON.parse(raw) : [];
  ticks.push({ timestamp: new Date().toISOString(), bid: Number(quote.bid), ask: Number(quote.ask) });
  while (ticks.length > 600) ticks.shift();
  await AsyncStorage.setItem(key, JSON.stringify(ticks));
};

const getHistory = async (symbol) => {
  const seeded = await getCandleHistory(symbol).catch(() => []);
  if (seeded?.length) return seeded.slice(-100);
  const raw = await AsyncStorage.getItem(tickKey(symbol));
  const ticks = raw ? JSON.parse(raw) : [];
  const byHour = new Map();
  ticks.forEach((t) => {
    const d = new Date(t.timestamp);
    d.setMinutes(0, 0, 0);
    const k = d.toISOString();
    const mid = (Number(t.bid) + Number(t.ask)) / 2;
    if (!byHour.has(k)) {
      byHour.set(k, { timestamp: k, open: mid, high: mid, low: mid, close: mid, volume: 1 });
      return;
    }
    const c = byHour.get(k);
    c.high = Math.max(c.high, mid);
    c.low = Math.min(c.low, mid);
    c.close = mid;
    c.volume += 1;
  });
  return Array.from(byHour.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-100);
};

const scoreToConfidence = (score) => (score >= 80 ? 'HIGH' : score >= 65 ? 'MEDIUM' : 'LOW');

const scanOne = async ({ symbol, price, eurusdPrice, news, calendar }) => {
  await saveTick(symbol, price);
  const history = await getHistory(symbol);

  const base = symbol === 'EURUSD'
    ? analyzeEURUSD({ history, price })
    : symbol === 'XAUUSD'
      ? analyzeXAUUSD({ history, price, eurusd: eurusdPrice })
      : analyzeBTCUSD({ history, price });

  const minTechScore = symbol === 'BTCUSD' ? 65 : symbol === 'XAUUSD' ? 60 : 55;
  const techScore = Number(base.technicals?.score || 0);

  if (techScore < minTechScore) {
    return {
      symbol,
      signal: 'WAIT',
      confidence: 'LOW',
      confidenceScore: techScore,
      waitReason: `Technical score ${techScore} below threshold ${minTechScore}.`,
      technicals: base.technicals,
      news,
      assetSpecific: base.assetSpecific,
    };
  }

  const aiSignal = await generateMultiAssetSignal(symbol, {
    prices: price,
    technicals: base.technicals,
    news,
    calendar,
    assetSpecific: base.assetSpecific,
  });

  const finalSignal = {
    ...aiSignal,
    symbol,
    assetClass: symbol === 'EURUSD' ? 'forex' : symbol === 'XAUUSD' ? 'commodity' : 'crypto',
    technicalScore: techScore,
    confidence: aiSignal.confidence || scoreToConfidence(aiSignal.confidenceScore || techScore),
    confidenceScore: Number(aiSignal.confidenceScore || techScore),
    newsSentiment: news.overallSentiment,
    newsScore: news.sentimentScore,
    assetSpecific: base.assetSpecific,
    demoMode: symbol === 'BTCUSD',
    demoNote: symbol === 'BTCUSD' ? 'BTCUSD may be demo-only depending on funded account instrument availability.' : null,
  };

  const thinkingReport = await buildTransparencyReport(
    symbol,
    price,
    base.technicals,
    news,
    calendar,
    finalSignal
  );

  return {
    ...finalSignal,
    thinkingReport,
  };
};

const saveSignals = async (userId, signals) => {
  await AsyncStorage.setItem(LAST_MULTI_KEY, JSON.stringify(signals));
  if (!userId) return;

  for (const sig of signals) {
    try {
      await supabase.from('signals').insert({
        user_id: userId,
        symbol: sig.symbol,
        pair: sig.symbol === 'EURUSD' ? 'EUR/USD' : sig.symbol === 'XAUUSD' ? 'XAU/USD' : 'BTC/USD',
        asset_class: sig.assetClass,
        direction: sig.signal,
        confidence: sig.confidence,
        entry_price: sig.entry?.price ?? null,
        entry_range: sig.entry?.range ?? null,
        stop_loss: sig.stopLoss?.price ?? null,
        take_profit: sig.takeProfit?.price ?? null,
        sl_pips: sig.stopLoss?.pips ?? sig.stopLoss?.distance ?? null,
        tp_pips: sig.takeProfit?.pips ?? sig.takeProfit?.distance ?? null,
        technical_score: sig.technicalScore ?? null,
        news_sentiment: sig.newsSentiment ?? null,
        news_score: sig.newsScore ?? null,
        thinking_report: sig.thinkingReport ?? null,
        dxy_value: sig.assetSpecific?.dxyValue ?? null,
        fear_greed_index: sig.assetSpecific?.fearGreedIndex ?? null,
        reasons: sig.thinkingReport?.scoreBreakdown?.bullishFactors || [],
        warnings: sig.thinkingReport?.risks?.map((r) => r.scenario) || [],
        simple_explanation: sig.thinkingReport?.simpleExplanation?.oneLiner || sig.waitReason || null,
        valid_until: new Date(Date.now() + (sig.validUntilMinutes || 60) * 60000).toISOString(),
      });
    } catch {
      // Keep local signal flow alive even if DB schema is not updated yet.
    }
  }
};

export const scanAllAssets = async (userId) => {
  const [prices, allNews, calendar] = await Promise.all([
    getAllPrices(),
    analyzeAllNews(),
    getEconomicCalendar().catch(() => []),
  ]);

  const signals = await Promise.all([
    scanOne({ symbol: 'EURUSD', price: prices.EURUSD, eurusdPrice: prices.EURUSD, news: allNews.EURUSD, calendar }),
    scanOne({ symbol: 'XAUUSD', price: prices.XAUUSD, eurusdPrice: prices.EURUSD, news: allNews.XAUUSD, calendar }),
    scanOne({ symbol: 'BTCUSD', price: prices.BTCUSD, eurusdPrice: prices.EURUSD, news: allNews.BTCUSD, calendar: [] }),
  ]);

  const ranked = [...signals].sort((a, b) => Number(b.confidenceScore || 0) - Number(a.confidenceScore || 0));
  const actionable = ranked.filter((s) => ['BUY', 'SELL'].includes(s.signal));
  const bestSignal = actionable[0] || null;

  await saveSignals(userId, ranked);

  if (bestSignal) {
    await notificationEngine.sendMultiAssetAlert(bestSignal, actionable.length).catch(() => {});
  }

  return {
    scanned: ['EURUSD', 'XAUUSD', 'BTCUSD'],
    signals: ranked,
    bestSignal,
    notificationSent: Boolean(bestSignal),
  };
};

export const getLatestMultiSignals = async () => {
  const raw = await AsyncStorage.getItem(LAST_MULTI_KEY);
  return raw ? JSON.parse(raw) : null;
};
