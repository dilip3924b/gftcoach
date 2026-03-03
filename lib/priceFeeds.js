import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASSET_PROFILES, GOLDAPI_KEY } from './constants';
import { storeGoldTick } from '../engine/candleSeeder';

const CACHE_KEY = 'price_cache';

const parseJSON = (v, fallback = null) => {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

const setCache = async (data) => {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: new Date().toISOString() }));
};

const getCache = async () => {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  return parseJSON(raw, null);
};

const getCachedPrice = async (symbol) => {
  const cache = await getCache();
  if (!cache?.data?.[symbol]) return null;
  return {
    ...cache.data[symbol],
    source: `${cache.data[symbol].source || 'unknown'} (cached)`,
    cached: true,
  };
};

const fetchEURUSD = async () => {
  try {
    const [bookRes, tickRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/bookTicker?symbol=EURUSDT'),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT'),
    ]);
    if (!bookRes.ok && !tickRes.ok) throw new Error('binance eurusdt failed');

    if (bookRes.ok) {
      const book = await bookRes.json();
      const bid = Number(book?.bidPrice || 0);
      const ask = Number(book?.askPrice || 0);
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        return {
          bid: parseFloat(bid.toFixed(5)),
          ask: parseFloat(ask.toFixed(5)),
          mid: parseFloat((((bid + ask) / 2).toFixed(5))),
          spread: Number(((ask - bid) * 10000).toFixed(1)),
          spreadUnit: 'pips',
          change24h: null,
          source: 'binance.com EURUSDT',
          timestamp: new Date().toISOString(),
          symbol: 'EURUSD',
          display: ASSET_PROFILES.EURUSD.symbol,
        };
      }
    }

    const tick = await tickRes.json();
    const rate = Number(tick?.price || 0);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid eur tick');
    const spread = 0.00012;

    return {
      bid: parseFloat((rate - spread / 2).toFixed(5)),
      ask: parseFloat((rate + spread / 2).toFixed(5)),
      mid: parseFloat(rate.toFixed(5)),
      spread: Number((spread * 10000).toFixed(1)),
      spreadUnit: 'pips',
      change24h: null,
      source: 'binance.com EURUSDT',
      timestamp: new Date().toISOString(),
      symbol: 'EURUSD',
      display: ASSET_PROFILES.EURUSD.symbol,
    };
  } catch {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('open er-api failed');
    const data = await res.json();
    const rate = 1 / Number(data?.rates?.EUR);
    if (!Number.isFinite(rate)) throw new Error('invalid eur backup rate');

    return {
      bid: parseFloat((rate - 0.00008).toFixed(5)),
      ask: parseFloat((rate + 0.00008).toFixed(5)),
      mid: parseFloat(rate.toFixed(5)),
      spread: 1.6,
      spreadUnit: 'pips',
      change24h: null,
      source: 'open.er-api.com',
      timestamp: new Date().toISOString(),
      symbol: 'EURUSD',
      display: ASSET_PROFILES.EURUSD.symbol,
    };
  }
};

const fetchXAUUSD = async () => {
  try {
    if (!GOLDAPI_KEY) throw new Error('missing gold-api key');
    const res = await fetch('https://gold-api.com/price/XAU', {
      headers: {
        'x-access-token': GOLDAPI_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) throw new Error('gold-api failed');
    const data = await res.json();
    const mid = Number(data?.price);
    const bid = Number(data?.bid || (mid - 0.65).toFixed(2));
    const ask = Number(data?.ask || (mid + 0.65).toFixed(2));

    if (!Number.isFinite(mid)) throw new Error('invalid gold price');

    return {
      bid,
      ask,
      mid,
      spread: parseFloat((ask - bid).toFixed(2)),
      spreadUnit: 'dollars',
      change: Number(data?.ch || 0),
      changePct: Number(data?.chp || 0),
      high24h: Number(data?.high_price || 0) || null,
      low24h: Number(data?.low_price || 0) || null,
      source: 'gold-api.com',
      timestamp: new Date().toISOString(),
      symbol: 'XAUUSD',
      display: ASSET_PROFILES.XAUUSD.symbol,
    };
  } catch {
    try {
      const yRes = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=5m');
      if (yRes.ok) {
        const yData = await yRes.json();
        const meta = yData?.chart?.result?.[0]?.meta || {};
        const mid = Number(meta?.regularMarketPrice || meta?.previousClose || 0);
        const prev = Number(meta?.previousClose || 0);
        if (Number.isFinite(mid) && mid > 0) {
          const changePct = prev > 0 ? ((mid - prev) / prev) * 100 : 0;
          return {
            bid: parseFloat((mid - 0.65).toFixed(2)),
            ask: parseFloat((mid + 0.65).toFixed(2)),
            mid: parseFloat(mid.toFixed(2)),
            spread: 1.3,
            spreadUnit: 'dollars',
            changePct: Number(changePct.toFixed(2)),
            source: 'yahoo finance GC=F',
            timestamp: new Date().toISOString(),
            symbol: 'XAUUSD',
            display: ASSET_PROFILES.XAUUSD.symbol,
          };
        }
      }
    } catch {
      // Continue to next fallback
    }

    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=XAU&symbols=USD');
      if (!res.ok) throw new Error('frankfurter xau failed');
      const data = await res.json();
      const mid = Number(data?.rates?.USD);
      if (!Number.isFinite(mid)) throw new Error('invalid xau backup rate');

      return {
        bid: parseFloat((mid - 0.65).toFixed(2)),
        ask: parseFloat((mid + 0.65).toFixed(2)),
        mid: parseFloat(mid.toFixed(2)),
        spread: 1.3,
        spreadUnit: 'dollars',
        source: 'frankfurter.dev (XAU)',
        timestamp: new Date().toISOString(),
        symbol: 'XAUUSD',
        display: ASSET_PROFILES.XAUUSD.symbol,
      };
    } catch {
      const res = await fetch('https://api.metals.live/v1/spot');
      if (!res.ok) throw new Error('metals.live xau failed');
      const data = await res.json();
      const row = Array.isArray(data) ? data.find((d) => Object.prototype.hasOwnProperty.call(d || {}, 'gold')) : null;
      const mid = Number(row?.gold);
      if (!Number.isFinite(mid)) throw new Error('invalid metals.live gold');
      return {
        bid: parseFloat((mid - 0.65).toFixed(2)),
        ask: parseFloat((mid + 0.65).toFixed(2)),
        mid: parseFloat(mid.toFixed(2)),
        spread: 1.3,
        spreadUnit: 'dollars',
        source: 'metals.live (XAU)',
        timestamp: new Date().toISOString(),
        symbol: 'XAUUSD',
        display: ASSET_PROFILES.XAUUSD.symbol,
      };
    }
  }
};

const fetchBTCUSD = async () => {
  try {
    const [priceRes, fearRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_24hr_high_low=true'),
      fetch('https://api.alternative.me/fng/?limit=1'),
    ]);

    if (!priceRes.ok) throw new Error('coingecko failed');
    const priceData = await priceRes.json();
    const btc = priceData?.bitcoin;
    const mid = Number(btc?.usd);
    if (!Number.isFinite(mid)) throw new Error('invalid btc price');

    let fearGreedIndex = null;
    let fearGreedLabel = null;
    if (fearRes.ok) {
      const fearData = await fearRes.json();
      fearGreedIndex = parseInt(fearData?.data?.[0]?.value, 10);
      fearGreedLabel = fearData?.data?.[0]?.value_classification || null;
    }

    return {
      bid: parseFloat((mid - 25).toFixed(2)),
      ask: parseFloat((mid + 25).toFixed(2)),
      mid: parseFloat(mid.toFixed(2)),
      spread: 50,
      spreadUnit: 'dollars',
      change24h: Number(btc?.usd_24h_change || 0),
      volume24h: Number(btc?.usd_24h_vol || 0),
      high24h: Number(btc?.usd_24h_high || 0) || null,
      low24h: Number(btc?.usd_24h_low || 0) || null,
      fearGreedIndex,
      fearGreedLabel,
      source: 'coingecko.com + alternative.me',
      timestamp: new Date().toISOString(),
      symbol: 'BTCUSD',
      display: ASSET_PROFILES.BTCUSD.symbol,
    };
  } catch {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    if (!res.ok) throw new Error('binance failed');
    const data = await res.json();
    const mid = Number(data?.lastPrice);
    if (!Number.isFinite(mid)) throw new Error('invalid binance btc');

    return {
      bid: parseFloat((mid - 25).toFixed(2)),
      ask: parseFloat((mid + 25).toFixed(2)),
      mid: parseFloat(mid.toFixed(2)),
      spread: 50,
      spreadUnit: 'dollars',
      change24h: Number(data?.priceChangePercent || 0),
      high24h: Number(data?.highPrice || 0) || null,
      low24h: Number(data?.lowPrice || 0) || null,
      volume24h: Number(data?.volume || 0) * mid,
      source: 'binance.com',
      timestamp: new Date().toISOString(),
      symbol: 'BTCUSD',
      display: ASSET_PROFILES.BTCUSD.symbol,
    };
  }
};

export const getAllPrices = async () => {
  const [eurusd, xauusd, btcusd] = await Promise.allSettled([
    fetchEURUSD(),
    fetchXAUUSD(),
    fetchBTCUSD(),
  ]);

  const result = {
    EURUSD: eurusd.status === 'fulfilled' ? eurusd.value : await getCachedPrice('EURUSD'),
    XAUUSD: xauusd.status === 'fulfilled' ? xauusd.value : await getCachedPrice('XAUUSD'),
    BTCUSD: btcusd.status === 'fulfilled' ? btcusd.value : await getCachedPrice('BTCUSD'),
    fetchedAt: new Date().toISOString(),
  };

  if (result?.XAUUSD?.mid) {
    await storeGoldTick(result.XAUUSD.mid);
  }

  await setCache(result);
  return result;
};

export const getPriceFreshness = async () => {
  const cache = await getCache();
  if (!cache?.fetchedAt) return null;
  return Date.now() - new Date(cache.fetchedAt).getTime();
};
