import AsyncStorage from '@react-native-async-storage/async-storage';
import { AI_CACHE, GROQ_API_KEY, GROQ_MODEL, IST_TIME_ZONE } from './constants';
import { getCurrentTradingSession, getEconomicCalendar, getLiveForexPrices } from './api';
import { db } from './db';
import { getMasterTechnicalScore } from '../engine/technicals';
import { getAllPrices } from './priceFeeds';
import { getCandleHistory } from '../engine/candleSeeder';
import {
  baseCoachContext,
  DANGER_ALERT_PROMPT,
  MORNING_BRIEFING_PROMPT,
  SAFETY_RULES,
  STEP_EXPLAINER_PROMPT,
  TRADE_REVIEW_PROMPT,
  TRADE_SIGNAL_PROMPT,
  WEEKLY_REVIEW_PROMPT,
} from './prompts';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_CALLS_KEY = 'groq_calls';
const AI_RESPONSE_CACHE_KEY = 'ai_response_cache';

const RATE_LIMIT = {
  MAX_PER_DAY: 14400,
};

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const nowIstString = () =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

const cacheGet = async (key) => {
  const raw = await AsyncStorage.getItem(AI_RESPONSE_CACHE_KEY);
  const cache = safeParse(raw, {});
  const entry = cache[key];
  if (!entry?.expiresAt) return null;
  if (new Date(entry.expiresAt).getTime() <= Date.now()) return null;
  return entry.data;
};

const cacheSet = async (key, data, ttlSeconds) => {
  const raw = await AsyncStorage.getItem(AI_RESPONSE_CACHE_KEY);
  const cache = safeParse(raw, {});
  cache[key] = {
    data,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
  await AsyncStorage.setItem(AI_RESPONSE_CACHE_KEY, JSON.stringify(cache));
};

export const rateLimitManager = {
  canMakeCall: async () => {
    const today = new Date().toDateString();
    const stored = await AsyncStorage.getItem(GROQ_CALLS_KEY);
    const calls = safeParse(stored, { date: today, count: 0 });
    if (calls.date !== today) {
      await AsyncStorage.setItem(GROQ_CALLS_KEY, JSON.stringify({ date: today, count: 0 }));
      return true;
    }
    return calls.count < RATE_LIMIT.MAX_PER_DAY;
  },

  recordCall: async () => {
    const today = new Date().toDateString();
    const stored = await AsyncStorage.getItem(GROQ_CALLS_KEY);
    const calls = safeParse(stored, { date: today, count: 0 });
    const next = calls.date === today ? calls : { date: today, count: 0 };
    next.count += 1;
    await AsyncStorage.setItem(GROQ_CALLS_KEY, JSON.stringify(next));
  },

  getDailyUsage: async () => {
    const today = new Date().toDateString();
    const stored = await AsyncStorage.getItem(GROQ_CALLS_KEY);
    const calls = safeParse(stored, { date: today, count: 0 });
    return calls.date === today ? calls.count : 0;
  },
};

const callGroq = async (messages, { maxTokens = 400, temperature = 0.4 } = {}) => {
  if (!GROQ_API_KEY) {
    return {
      content: '⚠️ AI key missing. Add EXPO_PUBLIC_GROQ_API_KEY in your env and restart Expo.',
      error: 'MISSING_API_KEY',
    };
  }

  const canCall = await rateLimitManager.canMakeCall();
  if (!canCall) {
    return { content: '⚠️ Daily AI limit reached. Resets at midnight!', error: 'DAILY_LIMIT' };
  }

  try {
    await rateLimitManager.recordCall();
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { content: '⚠️ AI coach is resting. Try again in about 60 seconds.', error: 'RATE_LIMIT' };
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error (${response.status})`);
    }

    const data = await response.json();
    return {
      content: data?.choices?.[0]?.message?.content || 'No response from AI coach.',
      tokensUsed: data?.usage?.total_tokens || 0,
      error: null,
    };
  } catch (error) {
    return {
      content: '📡 AI coach is offline right now. Check internet and try again.',
      error: error?.message || 'NETWORK_ERROR',
    };
  }
};

export const callGroqPrompt = async (systemPrompt, userMessage, maxTokens = 400, temperature = 0.3) => {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  return callGroq(messages, { maxTokens, temperature });
};

const buildCoachSystem = (prompt, context = {}) => {
  return `${prompt}
${baseCoachContext(context)}
Current IST time: ${nowIstString()}
${SAFETY_RULES}`;
};

const TICK_CACHE_KEY = 'price_ticks_EURUSD';

const aggregateTicksToH1Candles = (ticks = []) => {
  const byHour = new Map();
  ticks.forEach((tick) => {
    const d = new Date(tick.timestamp);
    if (Number.isNaN(d.getTime())) return;
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    const bid = Number(tick.bid || 0);
    const ask = Number(tick.ask || 0);
    const mid = bid && ask ? (bid + ask) / 2 : bid || ask;
    if (!mid) return;

    if (!byHour.has(key)) {
      byHour.set(key, { timestamp: key, open: mid, high: mid, low: mid, close: mid, volume: 1 });
      return;
    }
    const c = byHour.get(key);
    c.high = Math.max(c.high, mid);
    c.low = Math.min(c.low, mid);
    c.close = mid;
    c.volume += 1;
  });
  return Array.from(byHour.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

const getTechnicalSnapshot = async (liveBid, spreadPips) => {
  try {
    const raw = await AsyncStorage.getItem(TICK_CACHE_KEY);
    const ticks = safeParse(raw, []);
    const candles = aggregateTicksToH1Candles(ticks).slice(-80);
    if (candles.length < 12) {
      return {
        available: false,
        candles: candles.length,
        technicals: null,
        note: 'Not enough cached tick history yet for reliable technical scoring.',
      };
    }
    const technicals = getMasterTechnicalScore(candles, Number(liveBid || 0), Number(spreadPips || 0));
    return { available: true, candles: candles.length, technicals, note: null };
  } catch (error) {
    return {
      available: false,
      candles: 0,
      technicals: null,
      note: `Technical snapshot unavailable: ${error?.message || 'unknown error'}`,
    };
  }
};

const buildRiskMath = (direction, bid, ask) => {
  const entry = direction === 'SELL' ? Number(bid || 0) : Number(ask || 0);
  if (!entry) return null;

  const slPips = 25;
  const tpPips = 50;
  const pipSize = 0.0001;
  const pipValue = 0.1; // $0.10 for EUR/USD 0.01 lot

  const stopLoss = direction === 'SELL'
    ? entry + slPips * pipSize
    : entry - slPips * pipSize;
  const takeProfit = direction === 'SELL'
    ? entry - tpPips * pipSize
    : entry + tpPips * pipSize;

  return {
    direction,
    lotSize: 0.01,
    entry: Number(entry.toFixed(5)),
    stopLoss: Number(stopLoss.toFixed(5)),
    takeProfit: Number(takeProfit.toFixed(5)),
    slPips,
    tpPips,
    riskUSD: Number((slPips * pipValue).toFixed(2)),
    rewardUSD: Number((tpPips * pipValue).toFixed(2)),
    rr: Number((tpPips / slPips).toFixed(1)),
  };
};

export const getMorningBriefing = async (userId) => {
  const slotParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const y = slotParts.find((p) => p.type === 'year')?.value;
  const m = slotParts.find((p) => p.type === 'month')?.value;
  const d = slotParts.find((p) => p.type === 'day')?.value;
  const h = Number(slotParts.find((p) => p.type === 'hour')?.value || 0);
  const slot = h >= 18 ? '18' : h >= 13 ? '13' : h >= 9 ? '09' : 'pre';
  const cacheKey = `morning_${y}-${m}-${d}_${slot}_${userId || 'guest'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { content: cached, error: null, cached: true };

  const [calendar, session, profile, todayStats] = await Promise.all([
    getEconomicCalendar().catch(() => []),
    Promise.resolve(getCurrentTradingSession()),
    userId ? db.getProfile(userId) : Promise.resolve({ data: null }),
    userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0 } }),
  ]);

  const today = new Date().toDateString();
  const highImpactToday = (calendar || []).filter(
    (event) => event.impact === 'HIGH' && new Date(event.timestamp).toDateString() === today
  );

  const contextBlock = `
HIGH IMPACT NEWS TODAY:
${highImpactToday.length === 0 ? 'None.' : highImpactToday.map((event) => `- ${event.time}: ${event.event}`).join('\n')}
Current session: ${session.label}
Total profit: $${profile?.data?.total_profit || 0}
Today's P&L: $${todayStats?.data?.total_pl || 0}
`;

  const messages = [
    {
      role: 'system',
      content: buildCoachSystem(MORNING_BRIEFING_PROMPT, {
        sessionLabel: session.label,
        todayPL: todayStats?.data?.total_pl || 0,
        totalProfit: profile?.data?.total_profit || 0,
      }),
    },
    { role: 'user', content: `Give my morning briefing:\n${contextBlock}` },
  ];

  const result = await callGroq(messages, { maxTokens: 400, temperature: 0.3 });
  if (!result.error && result.content) {
    await cacheSet(cacheKey, result.content, AI_CACHE.MORNING_BRIEFING);
  }
  return result;
};

export const getTradeSignal = async (userId) => {
  const [prices, calendar, session, todayStats, profile] = await Promise.all([
    getLiveForexPrices().catch(() => ({})),
    getEconomicCalendar().catch(() => []),
    Promise.resolve(getCurrentTradingSession()),
    userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0, trades_count: 0 } }),
    userId ? db.getProfile(userId) : Promise.resolve({ data: { total_profit: 0 } }),
  ]);

  const eurusd = prices?.EURUSD || {};
  const isDangerNow = (calendar || []).some((event) => event.isDangerNow);
  const nextDanger = (calendar || []).find((event) => new Date(event.dangerWindowStart) > new Date());
  const technicalSnapshot = await getTechnicalSnapshot(eurusd?.bid, eurusd?.spread);
  const mathBuy = buildRiskMath('BUY', eurusd?.bid, eurusd?.ask);
  const mathSell = buildRiskMath('SELL', eurusd?.bid, eurusd?.ask);
  const defaultDirection = technicalSnapshot?.technicals?.signal === 'SELL' ? 'SELL' : 'BUY';
  const chosenMath = defaultDirection === 'SELL' ? mathSell : mathBuy;

  const contextBlock = `
EUR/USD Bid: ${eurusd?.bid ?? 'N/A'}
EUR/USD Ask: ${eurusd?.ask ?? 'N/A'}
Spread: ${eurusd?.spread ?? 'N/A'} pips
Danger now: ${isDangerNow ? 'YES' : 'NO'}
Next danger event: ${nextDanger ? `${nextDanger.event} at ${nextDanger.time}` : 'None today'}
Session: ${session.label}
Session minutes remaining: ${session.minutesRemaining}
Today's P&L: $${todayStats?.data?.total_pl || 0}
Today's trades: ${todayStats?.data?.trades_count || 0}
Technical score: ${technicalSnapshot?.technicals?.score ?? 'N/A'}
Technical signal: ${technicalSnapshot?.technicals?.signal ?? 'N/A'}
Technical confidence: ${technicalSnapshot?.technicals?.confidence ?? 'N/A'}
`;

  const messages = [
    {
      role: 'system',
      content: `${buildCoachSystem(TRADE_SIGNAL_PROMPT, {
        sessionLabel: session.label,
        todayPL: todayStats?.data?.total_pl || 0,
        totalProfit: profile?.data?.total_profit || 0,
      })}

Return valid JSON only:
{
  "signal": "BUY|SELL|WAIT",
  "confidence": "HIGH|MEDIUM|LOW",
  "why": ["short reason 1", "short reason 2"],
  "checks": {
    "marketOpen": true,
    "dangerNow": false,
    "spreadOk": true,
    "sessionOk": true
  },
  "entryPlan": {
    "entry": 1.12345,
    "stopLoss": 1.12095,
    "takeProfit": 1.12845,
    "slPips": 25,
    "tpPips": 50,
    "riskUSD": 2.5,
    "rewardUSD": 5.0,
    "rr": 2.0
  }
}`,
    },
    { role: 'user', content: `Analyze and provide a signal:\n${contextBlock}` },
  ];

  const ai = await callGroq(messages, { maxTokens: 350, temperature: 0.2 });

  let parsed = null;
  try {
    parsed = JSON.parse(ai?.content || '');
  } catch {
    parsed = null;
  }

  const sessionOk = ['london', 'overlap'].includes(session?.session);
  const spreadOk = Number(eurusd?.spread || 999) <= 7;
  const hardWait = isDangerNow || !sessionOk || !spreadOk;
  const computedFallbackSignal = hardWait
    ? 'WAIT'
    : (technicalSnapshot?.technicals?.signal || 'WAIT');
  const finalSignal = parsed?.signal || computedFallbackSignal;
  const finalMath = parsed?.entryPlan || chosenMath;

  const proof = {
    model: GROQ_MODEL,
    generatedAtIST: nowIstString(),
    market: {
      bid: eurusd?.bid ?? null,
      ask: eurusd?.ask ?? null,
      spreadPips: eurusd?.spread ?? null,
      session: session?.label,
      sessionMinutesRemaining: session?.minutesRemaining,
    },
    safetyChecks: {
      marketOpenWindow: sessionOk,
      dangerNow: isDangerNow,
      spreadOk,
      nextDanger: nextDanger ? `${nextDanger.event} at ${nextDanger.time}` : null,
    },
    accountContext: {
      todayPL: Number(todayStats?.data?.total_pl || 0),
      tradesToday: Number(todayStats?.data?.trades_count || 0),
      totalProfit: Number(profile?.data?.total_profit || 0),
    },
    technicals: technicalSnapshot,
    calculation: finalMath,
    aiDecision: parsed,
    rawModelOutput: ai?.content || null,
    tokensUsed: ai?.tokensUsed || null,
  };

  const content = [
    `🎯 SIGNAL: ${finalSignal}`,
    `Confidence: ${parsed?.confidence || technicalSnapshot?.technicals?.confidence || 'LOW'}`,
    '',
    'Proof Snapshot:',
    `• Bid/Ask: ${proof.market.bid ?? 'N/A'} / ${proof.market.ask ?? 'N/A'}`,
    `• Spread: ${proof.market.spreadPips ?? 'N/A'} pips`,
    `• Session: ${proof.market.session} (${proof.market.sessionMinutesRemaining} min left)`,
    `• Danger now: ${proof.safetyChecks.dangerNow ? 'YES' : 'NO'}`,
    `• Technical score: ${proof.technicals?.technicals?.score ?? 'N/A'}`,
    '',
    'Risk Math (0.01 lot):',
    `• Entry: ${proof.calculation?.entry ?? 'N/A'}`,
    `• SL: ${proof.calculation?.stopLoss ?? 'N/A'} (${proof.calculation?.slPips ?? 'N/A'} pips)`,
    `• TP: ${proof.calculation?.takeProfit ?? 'N/A'} (${proof.calculation?.tpPips ?? 'N/A'} pips)`,
    `• Risk: $${proof.calculation?.riskUSD ?? 'N/A'} | Reward: $${proof.calculation?.rewardUSD ?? 'N/A'} | R:R 1:${proof.calculation?.rr ?? 'N/A'}`,
    '',
    parsed?.why?.length ? `Why: ${parsed.why.join(' | ')}` : 'Why: Based on session, spread, danger checks, and technical score.',
    '',
    'Raw AI output (audit):',
    proof.rawModelOutput || 'N/A',
  ].join('\n');

  return { content, proof, error: ai?.error || null };
};

export const getAssetSignal = async (userId, symbol = 'EURUSD') => {
  const norm = String(symbol || 'EURUSD').replace('/', '').toUpperCase();
  const isXAU = norm === 'XAUUSD';
  const unitValue = isXAU ? 0.01 : 0.10;
  const pipSize = isXAU ? 1 : 0.0001;
  const decimals = isXAU ? 2 : 5;

  const [allPrices, calendar, session, assetCandles, eurCandles] = await Promise.all([
    getAllPrices().catch(() => ({})),
    getEconomicCalendar().catch(() => []),
    Promise.resolve(getCurrentTradingSession()),
    getCandleHistory(norm).catch(() => []),
    getCandleHistory('EURUSD').catch(() => []),
  ]);

  const now = new Date();
  const futureEvents = (calendar || [])
    .filter((e) => new Date(e.timestamp).getTime() > now.getTime())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const futureEvents4h = futureEvents.filter((e) => (new Date(e.timestamp).getTime() - now.getTime()) <= 4 * 60 * 60 * 1000);
  const nextDanger = futureEvents4h[0] || null;
  const minutesToNextDanger = nextDanger ? Math.max(0, Math.round((new Date(nextDanger.timestamp).getTime() - now.getTime()) / 60000)) : null;

  const px = allPrices?.[norm] || {};
  const bid = Number(px?.bid || 0);
  const ask = Number(px?.ask || 0);
  const mid = Number(px?.mid || ((bid && ask) ? (bid + ask) / 2 : 0));
  const spread = Number(px?.spread || 0);
  const price = ask || bid || mid;
  const ts = px?.timestamp ? new Date(px.timestamp).getTime() : null;
  const freshnessSec = ts ? Math.max(0, Math.floor((Date.now() - ts) / 1000)) : null;

  const candles = Array.isArray(assetCandles) ? assetCandles.slice(-72) : [];
  const c30 = candles.slice(-30);
  const calculateATR = (history, period = 14) => {
    if (!Array.isArray(history) || history.length < period + 1) return null;
    const slice = history.slice(-(period + 1));
    const trs = [];
    for (let i = 1; i < slice.length; i += 1) {
      const c = slice[i];
      const prevClose = Number(slice[i - 1]?.close || 0);
      const high = Number(c?.high || 0);
      const low = Number(c?.low || 0);
      if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose)) continue;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      if (Number.isFinite(tr)) trs.push(tr);
    }
    if (!trs.length) return null;
    return trs.reduce((a, b) => a + b, 0) / trs.length;
  };
  const closes = c30.map((c) => Number(c?.close || 0)).filter((v) => Number.isFinite(v) && v > 0);
  const firstClose = Number(c30?.[0]?.close || 0);
  const lastClose = Number(c30?.[c30.length - 1]?.close || 0);
  const trendPct = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  const countConsecutive = (arr, dir) => {
    if (!Array.isArray(arr) || arr.length < 2) return 0;
    let count = 0;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (dir === 'up' && cur > prev) count += 1;
      else if (dir === 'down' && cur < prev) count += 1;
      else break;
    }
    return count;
  };

  const last3Down = closes.length >= 4
    ? closes.slice(-4).every((v, i, arr) => i === 0 || arr[i] < arr[i - 1])
    : false;
  const last3Up = closes.length >= 4
    ? closes.slice(-4).every((v, i, arr) => i === 0 || arr[i] > arr[i - 1])
    : false;
  const consecutiveUp = countConsecutive(closes, 'up');
  const consecutiveDown = countConsecutive(closes, 'down');
  const momentumPct = closes.length >= 6
    ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100
    : 0;
  const support = c30.length ? Math.min(...c30.map((c) => Number(c.low || c.close || 0)).filter(Boolean)) : null;
  const resistance = c30.length ? Math.max(...c30.map((c) => Number(c.high || c.close || 0)).filter(Boolean)) : null;
  const technicalScore = c30.length >= 12
    ? Number(getMasterTechnicalScore(
      c30,
      Number(price || 0),
      Number(spread || 0),
      isXAU
        ? { pipSize: 1, proximityUnits: 8, decimals: 2, spreadType: 'dollars' }
        : { pipSize: 0.0001, proximityUnits: 10, decimals: 5, spreadType: 'pips' }
    )?.score || 0)
    : null;

  const trendDir = trendPct > 0 ? 'BULLISH' : trendPct < 0 ? 'BEARISH' : 'FLAT';
  let momentumDir = 'FLAT';
  if (trendDir === 'BEARISH') {
    if (consecutiveUp >= 5) momentumDir = 'BULLISH';
    else if (last3Down || consecutiveDown >= 3) momentumDir = 'BEARISH';
  } else if (trendDir === 'BULLISH') {
    if (consecutiveDown >= 5) momentumDir = 'BEARISH';
    else if (last3Up || consecutiveUp >= 3) momentumDir = 'BULLISH';
  } else {
    if (consecutiveUp >= 5) momentumDir = 'BULLISH';
    else if (consecutiveDown >= 5) momentumDir = 'BEARISH';
  }

  const getIstHM = () => {
    const [h, m] = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now).split(':').map((v) => Number(v));
    return h * 60 + m;
  };
  const istMins = getIstHM();
  // XAU/USD tradable window in IST:
  // Active: 1:30 PM -> 3:30 AM (London + full NY)
  // Dead zone: 3:30 AM -> 1:30 PM
  const xauDeadZone = istMins >= 3 * 60 + 30 && istMins < 13 * 60 + 30;
  const xauSessionOk = !xauDeadZone;
  // NY-only phase after London close
  const xauLateNY = istMins >= 22 * 60 + 30 || istMins < 3 * 60 + 30;
  const macroKeyword = (ev) => /NFP|CPI|FOMC|POWELL|FED/i.test(String(ev?.event || ''));
  const xauMacroRisk2h = isXAU && futureEvents4h.some((e) => macroKeyword(e) && ((new Date(e.timestamp).getTime() - now.getTime()) <= 120 * 60 * 1000));

  const eurRecent = Array.isArray(eurCandles) ? eurCandles.slice(-20) : [];
  const eurStart = Number(eurRecent?.[0]?.close || 0);
  const eurEnd = Number(eurRecent?.[eurRecent.length - 1]?.close || 0);
  const eurTrendPct = eurStart > 0 ? ((eurEnd - eurStart) / eurStart) * 100 : 0;
  const dxyInference = eurTrendPct > 0 ? 'Dollar weakening (DXY likely down)' : eurTrendPct < 0 ? 'Dollar strengthening (DXY likely up)' : 'Dollar flat (DXY likely flat)';

  const spreadOk = isXAU ? true : spread > 0 && spread <= 7;
  const baseDataReady = Boolean(price && c30.length >= 12);

  // RULES: trend always wins, momentum can confirm only.
  let signal = 'WAIT';
  let waitReason = '';
  if (!baseDataReady) {
    waitReason = 'Not enough live chart/price data for a safe signal.';
  } else if (!spreadOk) {
    waitReason = `Spread too wide (${spread} pips).`;
  } else if (isXAU && !xauSessionOk) {
    waitReason = 'Gold dead zone (3:30 AM-1:30 PM IST). Wait for London open.';
  } else if (isXAU && xauMacroRisk2h) {
    waitReason = 'Major USD macro event (NFP/CPI/FOMC) is within 2 hours.';
  } else if (trendDir === 'FLAT') {
    waitReason = 'Trend is flat with no directional edge.';
  } else if (momentumDir !== 'FLAT' && momentumDir !== trendDir) {
    waitReason = 'Trend and momentum are contradicting each other.';
  } else {
    signal = trendDir === 'BULLISH' ? 'BUY' : 'SELL';
  }

  // Extra gold driver pressure from inferred DXY.
  if (isXAU && signal !== 'WAIT') {
    if (signal === 'BUY' && eurTrendPct < 0) {
      signal = 'WAIT';
      waitReason = 'Trend suggests BUY but dollar is strengthening, so setup is mixed.';
    }
    if (signal === 'SELL' && eurTrendPct > 0) {
      signal = 'WAIT';
      waitReason = 'Trend suggests SELL but dollar is weakening, so setup is mixed.';
    }
  }

  const atr = calculateATR(c30, 14);
  const atrUnits = atr != null ? (isXAU ? atr : (atr / pipSize)) : null;
  const slDist = (() => {
    if (atrUnits == null || !Number.isFinite(atrUnits) || atrUnits <= 0) {
      return isXAU ? 120 : 25;
    }
    const base = Math.round(1.5 * atrUnits);
    if (isXAU) return Math.max(40, Math.min(500, base));
    return Math.max(10, Math.min(80, base));
  })();
  const tpDist = (() => {
    if (atrUnits == null || !Number.isFinite(atrUnits) || atrUnits <= 0) {
      return isXAU ? 240 : 50;
    }
    const base = Math.round(3 * atrUnits);
    if (isXAU) return Math.max(80, Math.min(1000, base));
    return Math.max(20, Math.min(160, base));
  })();
  const entry = signal === 'SELL' ? (bid || price) : (ask || price);
  const sl = signal === 'SELL'
    ? entry + slDist * pipSize
    : entry - slDist * pipSize;
  const tp = signal === 'SELL'
    ? entry - tpDist * pipSize
    : entry + tpDist * pipSize;
  const rr = tpDist / slDist;
  const validPad = isXAU ? 10 : 0.0004; // ±$10 for XAU, ±4 pips for EUR
  const entryLow = entry - validPad;
  const entryHigh = entry + validPad;

  let confidencePct = (() => {
    let v = 55;
    if (signal !== 'WAIT') v += 15;
    if (trendDir === momentumDir && trendDir !== 'FLAT') v += 10;
    if (technicalScore != null) v += Math.max(0, Math.min(15, Math.round((technicalScore - 50) / 3)));
    if (nextDanger && minutesToNextDanger != null && minutesToNextDanger < 120) v -= 10;
    if (isXAU && !xauSessionOk) v -= 10;
    return Math.max(20, Math.min(95, v));
  })();
  if (signal === 'WAIT') {
    confidencePct = Math.min(confidencePct, 45);
  }
  let confidence = signal === 'WAIT' ? 'LOW' : (confidencePct >= 75 ? 'HIGH' : confidencePct >= 55 ? 'MEDIUM' : 'LOW');
  if (isXAU && xauLateNY && signal !== 'WAIT' && Number(spread || 0) > 2 && confidence === 'HIGH') {
    confidence = 'MEDIUM';
    confidencePct = Math.min(confidencePct, 74);
  }
  const barFilled = Math.max(1, Math.round(confidencePct / 10));
  const bar = `${'█'.repeat(barFilled)}${'░'.repeat(10 - barFilled)}`;
  const confidenceReason = signal === 'WAIT'
    ? `LOW because ${waitReason || 'conditions are mixed.'}`
    : `${confidence} because trend and momentum are aligned with key levels${nextDanger ? ' and event risk is manageable.' : '.'}${isXAU && xauLateNY && Number(spread || 0) > 2 ? ' Confidence capped because spread is wider than $2 in this session.' : ''}`;

  const invalidation = signal === 'SELL'
    ? (resistance ? resistance + (isXAU ? 8 : 0.0004) : entry + (isXAU ? 8 : 0.0004))
    : (support ? support - (isXAU ? 8 : 0.0004) : entry - (isXAU ? 8 : 0.0004));

  const plainSummary = signal === 'WAIT'
    ? `"Mixed signals right now — ${waitReason || 'wait for clarity before entering.'}"`
    : isXAU
      ? (signal === 'BUY'
        ? `"Gold is rising with supportive dollar flow. Look to BUY within range."`
        : `"Gold trend is down with dollar support. Look to SELL rebounds."`)
      : (signal === 'BUY'
        ? `"EUR/USD is in an uptrend. Look to BUY pullbacks near the entry range."`
        : `"EUR/USD is in a strong downtrend. Look to SELL bounces near the entry range."`);

  const istDateTimeLabel = (dateObj) => new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj).replace(',', '') + ' IST';

  const getNextSessionStart = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const y = get('year');
    const mo = get('month') - 1;
    const d = get('day');
    const h = get('hour');
    const m = get('minute');
    const nowMins = h * 60 + m;
    const todayLondon = new Date(Date.UTC(y, mo, d, 8, 0, 0)); // 13:30 IST
    const todayNY = new Date(Date.UTC(y, mo, d, 13, 0, 0)); // 18:30 IST
    if (nowMins < 13 * 60 + 30) return todayLondon;
    if (nowMins < 18 * 60 + 30) return todayNY;
    return new Date(Date.UTC(y, mo, d + 1, 8, 0, 0));
  };

  const checkAfterDanger = nextDanger
    ? new Date(new Date(nextDanger.timestamp).getTime() + 30 * 60 * 1000)
    : null;
  const nextWindow = getNextSessionStart();
  const defaultCheck = checkAfterDanger && checkAfterDanger.getTime() < nextWindow.getTime()
    ? checkAfterDanger
    : nextWindow;
  const nextCheck = istDateTimeLabel(defaultCheck);

  const dataDangerLine = futureEvents4h.length
    ? `${futureEvents4h[0].event} at ${futureEvents4h[0].time}`
    : 'None today';

  const lines = [
    `🎯 SIGNAL: ${signal}`,
    `Confidence: ${confidence} ${bar} ${confidencePct}%`,
    `Why ${confidence}: ${confidenceReason}`,
    '',
    plainSummary,
    '',
    '[DATA CHECK]',
    `• Live price snapshot: bid ${bid || 'N/A'}, ask ${ask || 'N/A'}, mid ${mid || 'N/A'}, spread ${spread || 'N/A'} ${isXAU ? 'dollars' : 'pips'}`,
    `  source: ${px?.source || 'unknown'}, freshness ${freshnessSec ?? 'N/A'} seconds`,
    `• Session status: ${session?.label || 'N/A'}, ${session?.minutesRemaining ?? 'N/A'} minutes remaining`,
    `  Danger events: ${dataDangerLine}`,
    `• Chart data used: ${c30.length} candles, trend ${trendPct.toFixed(2)}% ${trendDir.toLowerCase()}, support ${support ? support.toFixed(decimals) : 'N/A'}, resistance ${resistance ? resistance.toFixed(decimals) : 'N/A'}, technical score ${technicalScore ?? 'N/A'}`,
    '',
    '[CHART REASONING]',
    `1) Trend direction and strength: ${trendDir} (${trendPct.toFixed(2)}% over recent candles).`,
    `2) Momentum reading: ${momentumDir} (${momentumPct.toFixed(2)}% short-window move).`,
    `3) Support/resistance position: price is ${price && resistance && support ? (price > resistance ? 'above resistance' : price < support ? 'below support' : 'between levels') : 'near key levels'}; support ${support ? support.toFixed(decimals) : 'N/A'}, resistance ${resistance ? resistance.toFixed(decimals) : 'N/A'}.`,
    `4) News/event risk impact: ${futureEvents4h.length ? `${futureEvents4h[0].event} in ${minutesToNextDanger} min.` : 'No high-impact events in next 4 hours.'}`,
    `5) Final confidence reason: ${confidenceReason}`,
    `6) What invalidates this signal: If price ${signal === 'SELL' ? 'breaks above' : 'breaks below'} ${invalidation.toFixed(decimals)}, this setup is invalid — exit immediately.`,
    '',
    '[CALCULATION]',
  ];

  if (isXAU) {
    lines.push(
      `- ATR(14): ${atr != null ? `$${atr.toFixed(2)}` : 'N/A'}`,
      `- SL distance: 1.5 x ATR = $${slDist} dollar move x 0.01 lot = $${(slDist * unitValue).toFixed(2)} risk`,
      `- TP distance: 3.0 x ATR = $${tpDist} dollar move x 0.01 lot = $${(tpDist * unitValue).toFixed(2)} reward`,
      `- R:R ratio: $${(tpDist * unitValue).toFixed(2)} / $${(slDist * unitValue).toFixed(2)} = ${rr.toFixed(1)}:1`,
      '',
      `Valid Entry Range: ${entryLow.toFixed(decimals)} - ${entryHigh.toFixed(decimals)}`,
      '→ Only tap Buy/Sell in MT5 if current price is within this range.',
      '  If price has moved outside this range - wait for next signal.',
      `Stop Loss: ${sl.toFixed(decimals)} ($${slDist} dollar move)`,
      `Take Profit: ${tp.toFixed(decimals)} ($${tpDist} dollar move)`,
      `Risk: $${(slDist * unitValue).toFixed(2)} | Reward: $${(tpDist * unitValue).toFixed(2)}`,
      `⚠️ Gold driver check: ${dxyInference}. ${futureEvents4h.length ? `Next event ${futureEvents4h[0].event} at ${futureEvents4h[0].time}.` : 'No near-term danger event (next 4h).'}`
    );
  } else {
    lines.push(
      `- ATR(14): ${atr != null ? `${(atr / pipSize).toFixed(1)} pips` : 'N/A'}`,
      `- SL distance: 1.5 x ATR = ${slDist} pips x $0.10 unit value = $${(slDist * unitValue).toFixed(2)} risk dollars`,
      `- TP distance: 3.0 x ATR = ${tpDist} pips x $0.10 unit value = $${(tpDist * unitValue).toFixed(2)} reward dollars`,
      `- R:R ratio: $${(tpDist * unitValue).toFixed(2)} / $${(slDist * unitValue).toFixed(2)} = ${rr.toFixed(1)}:1`,
      '',
      `Valid Entry Range: ${entryLow.toFixed(decimals)} - ${entryHigh.toFixed(decimals)}`,
      '→ Only tap Buy/Sell in MT5 if current price is within this range.',
      '  If price has moved outside this range - wait for next signal.',
      `Stop Loss: ${sl.toFixed(decimals)} (${slDist} pips)`,
      `Take Profit: ${tp.toFixed(decimals)} (${tpDist} pips)`,
      `Risk: $${(slDist * unitValue).toFixed(2)} | Reward: $${(tpDist * unitValue).toFixed(2)}`,
      `⚠️ ${futureEvents4h.length ? `Upcoming ${futureEvents4h[0].event} at ${futureEvents4h[0].time}.` : 'No upcoming high-impact event in next 4 hours.'}`
    );
  }

  if (signal === 'WAIT') {
    lines.push(
      '',
      'WAIT SIGNAL',
      `Reason: ${waitReason || 'Mixed conditions with no clean edge.'}`,
      `What to watch for: ${signal === 'SELL' || trendDir === 'BEARISH' ? `Break below ${support ? support.toFixed(decimals) : 'support level'} confirms SELL setup.` : `Break above ${resistance ? resistance.toFixed(decimals) : 'resistance level'} confirms BUY setup.`}`,
      `Check back at: ${nextCheck}`
    );
  }

  return { content: lines.join('\n'), error: null, fallback: true };
};

export const getTradeReview = async (userId, trade) => {
  const [allTrades, profile, session, todayStats] = await Promise.all([
    userId ? db.getTrades(userId) : Promise.resolve({ data: [] }),
    userId ? db.getProfile(userId) : Promise.resolve({ data: { total_profit: 0 } }),
    Promise.resolve(getCurrentTradingSession()),
    userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0 } }),
  ]);

  const trades = allTrades?.data || [];
  const wins = trades.filter((t) => Number(t.profit) > 0).length;
  const losses = trades.filter((t) => Number(t.profit) < 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  const contextBlock = `
Trade logged:
- Pair: ${trade?.pair}
- Direction: ${trade?.direction}
- Profit/Loss: $${trade?.profit}
- Note: "${trade?.note || 'No note'}"
Overall:
- Total trades: ${trades.length}
- Win rate: ${winRate}%
- Wins: ${wins}, Losses: ${losses}
`;

  const messages = [
    {
      role: 'system',
      content: buildCoachSystem(TRADE_REVIEW_PROMPT, {
        sessionLabel: session.label,
        todayPL: todayStats?.data?.total_pl || 0,
        totalProfit: profile?.data?.total_profit || 0,
      }),
    },
    { role: 'user', content: `Review this trade:\n${contextBlock}` },
  ];

  return callGroq(messages, { maxTokens: 350, temperature: 0.4 });
};

export const getDangerZoneAdvice = async (event, minutesUntil, userContext = {}) => {
  const messages = [
    {
      role: 'system',
      content: buildCoachSystem(DANGER_ALERT_PROMPT, userContext),
    },
    {
      role: 'user',
      content: `Danger event ${event?.event} in ${minutesUntil} minutes at ${event?.time} IST. What should I do now?`,
    },
  ];
  return callGroq(messages, { maxTokens: 200, temperature: 0.3 });
};

export const getWeeklyReview = async (userId) => {
  const cacheKey = `weekly_${new Date().toDateString()}_${userId || 'guest'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { content: cached, error: null, cached: true };

  const [tradesRes, profile, session, todayStats] = await Promise.all([
    userId ? db.getTrades(userId) : Promise.resolve({ data: [] }),
    userId ? db.getProfile(userId) : Promise.resolve({ data: { total_profit: 0 } }),
    Promise.resolve(getCurrentTradingSession()),
    userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0 } }),
  ]);
  const trades = tradesRes?.data || [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const weekTrades = trades.filter((t) => new Date(t.date || t.traded_at || t.created_at) >= weekAgo);
  const wins = weekTrades.filter((t) => Number(t.profit) > 0).length;
  const losses = weekTrades.filter((t) => Number(t.profit) < 0).length;
  const weekPL = weekTrades.reduce((sum, trade) => sum + Number(trade.profit || 0), 0);

  const contextBlock = `
Week trades: ${weekTrades.length}
Week wins/losses: ${wins}/${losses}
Week P&L: $${weekPL.toFixed(2)}
Total profit so far: $${profile?.data?.total_profit || 0}
`;

  const messages = [
    {
      role: 'system',
      content: buildCoachSystem(WEEKLY_REVIEW_PROMPT, {
        sessionLabel: session.label,
        todayPL: todayStats?.data?.total_pl || 0,
        totalProfit: profile?.data?.total_profit || 0,
      }),
    },
    { role: 'user', content: `Give weekly review:\n${contextBlock}` },
  ];

  const result = await callGroq(messages, { maxTokens: 500, temperature: 0.4 });
  if (!result.error && result.content) {
    await cacheSet(cacheKey, result.content, AI_CACHE.WEEKLY_REVIEW);
  }
  return result;
};

export const explainGuideStep = async (stepTitle, stepContent, userQuestion, userContext = {}) => {
  const messages = [
    {
      role: 'system',
      content: buildCoachSystem(STEP_EXPLAINER_PROMPT, userContext),
    },
    {
      role: 'user',
      content: `Step title: ${stepTitle}\nStep content: ${stepContent}\nQuestion: ${userQuestion || 'Explain this simply.'}`,
    },
  ];
  return callGroq(messages, { maxTokens: 300, temperature: 0.4 });
};

export const chatWithCoach = async (userId, conversationHistory, newMessage) => {
  const [profile, todayStats, session] = await Promise.all([
    userId ? db.getProfile(userId) : Promise.resolve({ data: { total_profit: 0 } }),
    userId ? db.getTodayStats(userId) : Promise.resolve({ data: { total_pl: 0 } }),
    Promise.resolve(getCurrentTradingSession()),
  ]);

  const system = `You are an expert forex mentor for a beginner trader in India.
Use very simple language and short answers (under 150 words unless asked for details).
Account rules: EUR/USD only, 0.01 lot size only, daily loss limit $30.
Never guarantee outcomes.
${baseCoachContext({
  sessionLabel: session.label,
  todayPL: todayStats?.data?.total_pl || 0,
  totalProfit: profile?.data?.total_profit || 0,
})}
Current IST time: ${nowIstString()}
${SAFETY_RULES}`;

  const messages = [
    { role: 'system', content: system },
    ...(conversationHistory || []).slice(-10).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: 'user', content: newMessage },
  ];

  return callGroq(messages, { maxTokens: 400, temperature: 0.5 });
};

export const getEntryWindowAI = async (
  signal,
  window,
  minutesSince,
  pipsFromOriginal,
  currentEntry,
  adjustedSL,
  adjustedTP,
  rrRatio
) => {
  const context = `
Direction: ${signal?.signal}
Original entry: ${signal?.entry?.range}
Original SL/TP: ${signal?.stopLoss?.price}/${signal?.takeProfit?.price}
Window: ${window?.name}
Minutes since signal: ${Math.round(minutesSince)}
Price moved: ${Math.round(pipsFromOriginal)} pips
Current entry: ${Number(currentEntry).toFixed(5)}
Adjusted SL: ${Number(adjustedSL).toFixed(5)}
Adjusted TP: ${Number(adjustedTP).toFixed(5)}
R:R: 1:${Number(rrRatio).toFixed(1)}
`;

  let systemPrompt = `You are a trading coach for a beginner. Be specific, simple, and calm. Under 120 words.`;

  if (window?.name === 'immediate') {
    systemPrompt += `
Format:
🟢 RIGHT NOW
Entry: ...
SL: ... | TP: ...
One-line confidence note
One clear action in next 30 seconds`;
  } else if (window?.name === 'extended') {
    systemPrompt += `
Format:
🟡 YOU CAN STILL ENTER
Price moved X pips but setup can still work.
NEW NUMBERS TO USE:
Entry ...
Stop Loss ...
Take Profit ...
Risk ... Reward ... R:R ...
One clear action now`;
  } else if (window?.name === 'late') {
    systemPrompt += `
If R:R < 1.8, advise SKIP clearly.
Otherwise allow cautious entry.
Format:
⚠️ LATE ENTRY
Decision: ENTER or SKIP
Reason in simple language`;
  }

  return callGroqPrompt(systemPrompt, context, 280, 0.3);
};

export const askAboutSignal = async (signal, entryStatus, userQuestion) => {
  const systemPrompt = `You are helping a beginner understand a live EUR/USD signal.
Use very simple language and keep under 100 words.
If user asks "should I still enter", answer YES or NO first, then one reason.`;

  const context = `
Signal: ${signal?.signal}
Entry window: ${entryStatus?.windowLabel}
Can still enter: ${entryStatus?.canStillEnter}
Current entry: ${entryStatus?.currentEntry?.price}
Adjusted SL: ${entryStatus?.adjustedSL}
Adjusted TP: ${entryStatus?.adjustedTP}
R:R: ${entryStatus?.rrRatio}
Question: ${userQuestion}
`;

  return callGroqPrompt(systemPrompt, context, 250, 0.4);
};

export const getEntryTimingAnalysis = async (userId) => {
  const signalsRes = await db.getSignalsWithEntryData(userId);
  const signals = signalsRes?.data || [];
  if (!signals.length) {
    return { content: 'No signal timing data yet. Use the app for a few sessions to get personalized timing feedback.', error: null };
  }

  const withOpen = signals.filter((s) => s.user_opened_at && s.generated_at);
  const avgMinutesLate = withOpen.length
    ? withOpen.reduce((sum, s) => sum + (new Date(s.user_opened_at) - new Date(s.generated_at)) / 60000, 0) / withOpen.length
    : 0;

  const windows = {
    immediate: signals.filter((s) => s.user_entry_window === 'immediate').length,
    extended: signals.filter((s) => s.user_entry_window === 'extended').length,
    late: signals.filter((s) => s.user_entry_window === 'late').length,
    expired: signals.filter((s) => s.user_entry_window === 'expired').length,
    skipped: signals.filter((s) => s.user_entry_window === 'skipped').length,
  };

  const message = `
Signals received: ${signals.length}
Avg response time: ${avgMinutesLate.toFixed(1)} minutes
Immediate: ${windows.immediate}
Extended: ${windows.extended}
Late: ${windows.late}
Expired: ${windows.expired}
Skipped: ${windows.skipped}
Give practical advice to improve signal reaction time.`;

  return callGroqPrompt(
    'You are a trading coach. Provide concise practical timing advice in under 120 words.',
    message,
    300,
    0.3
  );
};

export const generateMultiAssetSignal = async (symbol, analysisData) => {
  const prompts = {
    EURUSD: `You are an expert EUR/USD analyst for a beginner in India. Return strict JSON only. Respect 0.01 lot risk.`,
    XAUUSD: `You are an expert XAU/USD (gold) analyst. Include DXY/fundamental context. Return strict JSON only.`,
    BTCUSD: `You are an expert BTC/USD analyst. Include fear-greed and crypto-news context. Return strict JSON only.`,
  };

  const context = `
SYMBOL: ${symbol}
PRICES: ${JSON.stringify(analysisData?.prices || {}, null, 2)}
TECHNICALS: ${JSON.stringify(analysisData?.technicals || {}, null, 2)}
NEWS: ${JSON.stringify({
  overallSentiment: analysisData?.news?.overallSentiment,
  sentimentScore: analysisData?.news?.sentimentScore,
  topHeadlines: (analysisData?.news?.headlines || []).slice(0, 4).map((h) => h.title),
}, null, 2)}
CALENDAR: ${JSON.stringify((analysisData?.calendar || []).slice(0, 4), null, 2)}
ASSET_SPECIFIC: ${JSON.stringify(analysisData?.assetSpecific || {}, null, 2)}
`;

  const format = `
Return valid JSON only:
{
  "signal": "BUY|SELL|WAIT",
  "confidence": "HIGH|MEDIUM|LOW",
  "confidenceScore": 0,
  "validUntilMinutes": 60,
  "entry": { "price": 0, "range": "0 - 0", "description": "" },
  "stopLoss": { "price": 0, "distance": 0, "unit": "pips|points|dollars", "maxLoss": 0, "description": "" },
  "takeProfit": { "price": 0, "distance": 0, "unit": "pips|points|dollars", "potentialGain": 0, "description": "" },
  "rrRatio": "1:2",
  "thinkingReport": {
    "dataCollected": {
      "priceAction": "",
      "trend": "",
      "keyLevels": "",
      "momentum": "",
      "newsImpact": "",
      "assetSpecificFactor": ""
    },
    "comparisons": [
      {
        "factor": "Trend Direction",
        "what_ai_saw": "",
        "verdict": "SUPPORTS BUY|SUPPORTS SELL|NEUTRAL|RISK",
        "weight": 25,
        "simpleExplanation": ""
      }
    ],
    "scoreBreakdown": {
      "bullishFactors": [],
      "bearishFactors": [],
      "totalScore": 0,
      "whyThisScore": ""
    },
    "risks": [{ "scenario": "", "probability": "", "howProtected": "" }],
    "simpleExplanation": {
      "oneLiner": "",
      "analogy": "",
      "whySL": "",
      "whyTP": ""
    }
  },
  "waitReason": null,
  "nextCheckAt": null
}
`;

  const res = await callGroqPrompt(prompts[symbol] || prompts.EURUSD, `${context}\n${format}`, 1300, 0.25);
  try {
    const parsed = JSON.parse(res.content || '{}');
    return {
      ...parsed,
      symbol,
      lotSize: 0.01,
      generatedAt: new Date().toISOString(),
      error: res.error || null,
    };
  } catch {
    return {
      symbol,
      signal: 'WAIT',
      confidence: 'LOW',
      confidenceScore: 0,
      waitReason: 'Signal parsing failed.',
      generatedAt: new Date().toISOString(),
      error: res.error || 'PARSE_FAILED',
    };
  }
};

export const getActiveTradePnL = async (symbol, direction, entry, sl, tp, currentPrice, pnl) => {
  const isFx = symbol === 'EURUSD';
  const units = isFx
    ? Math.round(Math.abs(Number(currentPrice || 0) - Number(entry || 0)) / 0.0001)
    : Math.round(Math.abs(Number(currentPrice || 0) - Number(entry || 0)));
  const distToTP = isFx
    ? Math.round(Math.abs(Number(tp || 0) - Number(currentPrice || 0)) / 0.0001)
    : Math.round(Math.abs(Number(tp || 0) - Number(currentPrice || 0)));
  const distToSL = isFx
    ? Math.round(Math.abs(Number(currentPrice || 0) - Number(sl || 0)) / 0.0001)
    : Math.round(Math.abs(Number(currentPrice || 0) - Number(sl || 0)));

  const systemPrompt = `You are monitoring an active trade for a beginner in India.
Give a brief status update in under 60 words. Be calm and reassuring.
If profit: encourage holding. If loss: remind SL protects them. Never panic.`;

  const userMsg = `Trade: ${symbol} ${direction}
Entry: ${entry} Current: ${currentPrice}
P&L: ${Number(pnl) >= 0 ? '+' : ''}$${pnl} (${units} ${isFx ? 'pips' : 'dollar move'})
Distance to TP: ${distToTP}
Distance to SL: ${distToSL}
Brief status update:`;

  return callGroqPrompt(systemPrompt, userMsg, 150, 0.4);
};

export const getBestAssetToday = async (allPrices, allNews, calendar = []) => {
  const dangerCount = (calendar || []).filter((e) => !e.isDangerNow && Number(e.minutesUntil) < 120).length;

  const systemPrompt = `You are recommending which of 3 assets a beginner in India should trade today.
Assets: EUR/USD (most stable), XAU/USD (gold, medium), BTC/USD (most volatile).
Be decisive. Pick ONE. Under 50 words. Simple language.`;

  const userMsg = `EUR/USD: ${allPrices?.EURUSD?.mid} (${allPrices?.EURUSD?.change24h}% 24h), sentiment: ${allNews?.EURUSD?.overallSentiment}
XAU/USD: $${allPrices?.XAUUSD?.mid} (${allPrices?.XAUUSD?.change24h || allPrices?.XAUUSD?.changePct}% 24h), sentiment: ${allNews?.XAUUSD?.overallSentiment}
BTC/USD: $${allPrices?.BTCUSD?.mid} (${allPrices?.BTCUSD?.change24h}% 24h), Fear/Greed: ${allPrices?.BTCUSD?.fearGreedIndex}/100
Danger events in next 2 hours: ${dangerCount}`;

  return callGroqPrompt(systemPrompt, userMsg, 150, 0.3);
};
