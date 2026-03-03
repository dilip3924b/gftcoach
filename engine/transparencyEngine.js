import { callGroqPrompt } from '../lib/groq';
import { IST_TIME_ZONE } from '../lib/constants';

export const AI_THINKING_REPORT_SCHEMA = {
  dataGathered: {},
  comparisons: [],
  scoreBreakdown: {},
  decision: {},
  risks: [],
  simpleExplanation: {},
};

const nowIst = () =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

const toVerdict = (signal) => {
  if (signal === 'BUY') return 'SUPPORTS BUY';
  if (signal === 'SELL') return 'SUPPORTS SELL';
  return 'NEUTRAL';
};

const baseComparisons = (technicals, newsSignal) => {
  const tSignal = technicals?.signal || 'WAIT';
  const newsVerdict = newsSignal === 'BUY' ? 'SUPPORTS BUY' : newsSignal === 'SELL' ? 'SUPPORTS SELL' : 'NEUTRAL';

  return [
    {
      factor: 'Trend Direction',
      what_ai_saw: technicals?.breakdown?.trend?.detail || 'Trend unavailable',
      verdict: toVerdict(tSignal),
      weight: 25,
      simpleExplanation: 'Like choosing traffic flow, follow where market is already moving.',
    },
    {
      factor: 'Price at Key Levels',
      what_ai_saw: technicals?.breakdown?.levels?.detail || 'Support/resistance unavailable',
      verdict: toVerdict(tSignal),
      weight: 25,
      simpleExplanation: 'Like buying near discount shelf and selling near premium shelf.',
    },
    {
      factor: 'Momentum',
      what_ai_saw: technicals?.breakdown?.rsi?.detail || 'Momentum unavailable',
      verdict: toVerdict(tSignal),
      weight: 15,
      simpleExplanation: 'Like batting form in cricket, momentum shows current confidence.',
    },
    {
      factor: 'News Sentiment',
      what_ai_saw: `News signal is ${newsSignal}`,
      verdict: newsVerdict,
      weight: 20,
      simpleExplanation: 'News sets mood like weather before a match.',
    },
  ];
};

export const buildTransparencyReport = async (symbol, prices, technicals, news, calendar, signal) => {
  const assetPrice = prices || {};
  const score = Number(technicals?.score || 0);
  const comparisons = baseComparisons(technicals, news?.newsSignal || 'NEUTRAL');

  const bullishFactors = comparisons.filter((c) => c.verdict.includes('BUY')).map((c) => c.factor);
  const bearishFactors = comparisons.filter((c) => c.verdict.includes('SELL')).map((c) => c.factor);
  const danger = (calendar || []).filter((e) => e.impact === 'HIGH').slice(0, 2);

  const report = {
    dataGathered: {
      prices: {
        current: assetPrice?.bid ?? 'N/A — unavailable',
        high24h: assetPrice?.high24h ?? 'N/A — unavailable',
        low24h: assetPrice?.low24h ?? 'N/A — unavailable',
        change24h: assetPrice?.change24h ?? 0,
        spread: assetPrice?.spread ?? 'N/A — unavailable',
        source: assetPrice?.source || 'unknown',
        freshness: `${nowIst()} IST`,
      },
      technicals: technicals || { note: 'N/A — unavailable' },
      news: (news?.headlines || []).slice(0, 4),
      calendar: danger,
      assetSpecific: signal?.assetSpecific || {},
    },
    comparisons,
    scoreBreakdown: {
      bullishFactors,
      bearishFactors,
      totalScore: score,
      whyThisScore: `Technical score ${score}/100 with news sentiment ${news?.overallSentiment || 'neutral'}.`,
    },
    decision: {
      signal: signal?.signal || 'WAIT',
      confidence: signal?.confidence || 'LOW',
      entry: signal?.entry || null,
      stopLoss: signal?.stopLoss || null,
      takeProfit: signal?.takeProfit || null,
      rrRatio: signal?.rrRatio || null,
      reasoning: signal?.waitReason || 'Decision based on technical + news checks.',
    },
    risks: [
      ...(danger.length
        ? danger.map((e) => ({
            scenario: `${e.event} at ${e.time}`,
            probability: 'Medium',
            howProtected: 'Avoid 30 minutes before/after high-impact release.',
          }))
        : [
            {
              scenario: 'Unexpected volatility spike',
              probability: 'Low',
              howProtected: 'Fixed SL and 0.01 lot size limit downside.',
            },
          ]),
    ],
    simpleExplanation: {
      oneLiner: `${symbol} ${signal?.signal || 'WAIT'} based on current technical + news alignment.`,
      analogy: 'Like choosing batting order: check pitch (trend), weather (news), and field placement (levels) before shot selection.',
      whySL: 'SL is placed at invalidation level where setup logic breaks.',
      whyTP: 'TP targets next likely reaction zone for at least 1:2 reward/risk.',
    },
  };

  const system = `Rewrite this trading transparency report for a beginner in India.
Keep all numbers unchanged. Use simple language and one Indian analogy.
Return strict JSON with keys: simpleExplanation, risks.`;

  const ai = await callGroqPrompt(system, JSON.stringify(report), 450, 0.3);
  try {
    const parsed = JSON.parse(ai.content || '{}');
    return {
      ...report,
      simpleExplanation: parsed.simpleExplanation || report.simpleExplanation,
      risks: parsed.risks || report.risks,
      aiGeneratedAt: new Date().toISOString(),
    };
  } catch {
    return { ...report, aiGeneratedAt: new Date().toISOString() };
  }
};
