import { getCurrentTradingSession } from '../lib/api';
import { callGroqPrompt } from '../lib/groq';
import { calculateRiskParams, checkDailyLimitSafe } from './riskEngine';

const parseJSON = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const generateFinalSignal = async ({ technicals, prices, calendar, userId, todayPL = 0 }) => {
  const direction = technicals?.signal || 'WAIT';
  if (direction === 'WAIT') {
    return {
      signal: 'WAIT',
      confidence: 'LOW',
      waitReason: 'Technical score below threshold.',
      generatedAt: new Date().toISOString(),
    };
  }

  const risk = calculateRiskParams({
    direction,
    entryPrice: direction === 'BUY' ? prices.ask : prices.bid,
    nearestSupport: technicals?.breakdown?.levels?.nearestSupport,
    nearestResistance: technicals?.breakdown?.levels?.nearestResistance,
    spreadPips: prices?.spread || 0,
  });

  const dailySafety = checkDailyLimitSafe(todayPL, risk.maxLoss);
  const session = getCurrentTradingSession();
  const dangerNow = (calendar || []).some((event) => event.isDangerNow);

  if (!dailySafety.safe || dangerNow || (prices?.spread || 0) > 5 || session.minutesRemaining < 30 || technicals.score < 60) {
    return {
      signal: 'WAIT',
      confidence: 'LOW',
      validUntilMinutes: 15,
      waitReason: !dailySafety.safe
        ? dailySafety.message
        : dangerNow
          ? 'Danger news zone is active. Avoid trading.'
          : (prices?.spread || 0) > 5
            ? 'Spread too high now. Wait for better conditions.'
            : session.minutesRemaining < 30
              ? 'Session closing soon. Skip this setup.'
              : 'Technical score too low for safe execution.',
      generatedAt: new Date().toISOString(),
    };
  }

  const context = `
Technical score: ${technicals.score}/100
Direction: ${direction}
Current bid/ask: ${prices.bid}/${prices.ask}
Spread pips: ${prices.spread}
Session: ${session.label} (${session.minutesRemaining} mins left)
Risk:
entry ${risk.entry}
sl ${risk.stopLoss} (${risk.slPips} pips)
tp ${risk.takeProfit} (${risk.tpPips} pips)
maxLoss ${risk.maxLoss}
potentialGain ${risk.potentialGain}
Reasons: ${(technicals.reasons || []).join('; ')}
Warnings: ${(technicals.warnings || []).join('; ')}
`;

  const systemPrompt = `You are a forex signal validator.
Output only valid JSON and no markdown.
Rules:
- If spread > 5 OR session < 30 mins OR danger news active within 45 mins -> signal WAIT.
- Use EUR/USD and lot size 0.01 only.
- Risk reward minimum 1:2.
JSON format:
{
  "signal": "BUY|SELL|WAIT",
  "confidence": "HIGH|MEDIUM|LOW",
  "validUntilMinutes": 45,
  "entry": {"price": 1.1805, "range": "1.1800 - 1.1810", "description": "..."},
  "stopLoss": {"price": 1.1775, "pips": 25, "maxLoss": 2.5, "description": "..."},
  "takeProfit": {"price": 1.1855, "pips": 50, "potentialGain": 5.0, "description": "..."},
  "reasons": ["..."],
  "warnings": ["..."],
  "simpleExplanation": "...",
  "waitReason": null
}`;

  const ai = await callGroqPrompt(systemPrompt, context, 600, 0.2);
  const parsed = parseJSON(ai?.content || '');

  if (!parsed) {
    return {
      signal: direction,
      confidence: technicals.confidence === 'HIGH' ? 'MEDIUM' : 'LOW',
      validUntilMinutes: 45,
      entry: { price: risk.entry, range: risk.entryRange, description: 'Enter only inside this zone.' },
      stopLoss: {
        price: risk.stopLoss,
        pips: risk.slPips,
        maxLoss: risk.maxLoss,
        description: 'Stop loss protects downside.',
      },
      takeProfit: {
        price: risk.takeProfit,
        pips: risk.tpPips,
        potentialGain: risk.potentialGain,
        description: 'Take profit locks gains.',
      },
      reasons: technicals.reasons || [],
      warnings: technicals.warnings || [],
      simpleExplanation: 'Setup is technically valid. Follow exact SL/TP and keep lot size 0.01.',
      waitReason: null,
      generatedAt: new Date().toISOString(),
      pair: 'EUR/USD',
      lotSize: 0.01,
      technicalScore: technicals.score,
    };
  }

  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
    pair: 'EUR/USD',
    lotSize: 0.01,
    technicalScore: technicals.score,
    userId,
  };
};
