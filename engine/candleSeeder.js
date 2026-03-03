import AsyncStorage from '@react-native-async-storage/async-storage';

export const seedCandleHistory = async () => {
  await Promise.allSettled([
    seedBinanceCandles('EURUSD', 'EURUSDT'),
    seedBinanceCandles('BTCUSD', 'BTCUSDT'),
    seedGoldCandlesFromYahoo(),
    buildGoldCandlesFromTicks(),
  ]);
};

const seedBinanceCandles = async (symbol, binanceSymbol) => {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=72`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const candles = (raw || []).map((c) => ({
      timestamp: new Date(c[0]).toISOString(),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
    await AsyncStorage.setItem(`candles_${symbol}`, JSON.stringify(candles));
  } catch (e) {
    console.warn(`Candle seed failed for ${symbol}:`, e?.message || e);
  }
};

const seedGoldCandlesFromYahoo = async () => {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=10d&interval=1h&includePrePost=false';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const q = result?.indicators?.quote?.[0] || {};
    const opens = Array.isArray(q?.open) ? q.open : [];
    const highs = Array.isArray(q?.high) ? q.high : [];
    const lows = Array.isArray(q?.low) ? q.low : [];
    const closes = Array.isArray(q?.close) ? q.close : [];
    const volumes = Array.isArray(q?.volume) ? q.volume : [];

    const candles = timestamps
      .map((ts, i) => {
        const open = Number(opens[i]);
        const high = Number(highs[i]);
        const low = Number(lows[i]);
        const close = Number(closes[i]);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
          return null;
        }
        return {
          timestamp: new Date(ts * 1000).toISOString(),
          open,
          high,
          low,
          close,
          volume: Number.isFinite(Number(volumes[i])) ? Number(volumes[i]) : 0,
        };
      })
      .filter(Boolean);

    if (candles.length >= 48) {
      await AsyncStorage.setItem('candles_XAUUSD', JSON.stringify(candles.slice(-240)));
      return;
    }
    throw new Error(`insufficient candles from yahoo: ${candles.length}`);
  } catch (e) {
    console.warn('Candle seed failed for XAUUSD (Yahoo):', e?.message || e);
  }
};

export const storeGoldTick = async (price) => {
  try {
    const raw = await AsyncStorage.getItem('ticks_XAUUSD');
    const ticks = raw ? JSON.parse(raw) : [];
    ticks.push({ ts: Date.now(), price: Number(price) });
    await AsyncStorage.setItem('ticks_XAUUSD', JSON.stringify(ticks.slice(-600)));
  } catch {
    // no-op
  }
};

const buildGoldCandlesFromTicks = async () => {
  try {
    const raw = await AsyncStorage.getItem('ticks_XAUUSD');
    if (!raw) return;
    const ticks = JSON.parse(raw);
    if (!Array.isArray(ticks) || ticks.length < 4) return;

    const byHour = {};
    ticks.forEach(({ ts, price }) => {
      if (!ts || !Number.isFinite(Number(price))) return;
      const d = new Date(ts);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      if (!byHour[key]) byHour[key] = [];
      byHour[key].push(Number(price));
    });

    const tickCandles = Object.entries(byHour)
      .map(([ts, prices]) => ({
        timestamp: ts,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: prices.length,
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!tickCandles.length) return;

    const existingRaw = await AsyncStorage.getItem('candles_XAUUSD');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const mergedMap = new Map();

    (Array.isArray(existing) ? existing : []).forEach((c) => {
      if (!c?.timestamp) return;
      mergedMap.set(c.timestamp, c);
    });
    tickCandles.forEach((c) => {
      mergedMap.set(c.timestamp, c);
    });

    const merged = Array.from(mergedMap.values())
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-300);

    await AsyncStorage.setItem('candles_XAUUSD', JSON.stringify(merged));
  } catch {
    // no-op
  }
};

export const getCandleHistory = async (symbol) => {
  try {
    const raw = await AsyncStorage.getItem(`candles_${symbol}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
