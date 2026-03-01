import AsyncStorage from '@react-native-async-storage/async-storage';
import { AI_CACHE, GROQ_API_KEY, GROQ_MODEL, IST_TIME_ZONE } from './constants';
import { getCurrentTradingSession, getEconomicCalendar, getLiveForexPrices } from './api';
import { db } from './db';
import { getMasterTechnicalScore } from '../engine/technicals';
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
  const cacheKey = `morning_${new Date().toDateString()}_${userId || 'guest'}`;
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
