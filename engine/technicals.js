const getCloses = (history = []) => history.map((c) => Number(c.close || 0)).filter(Boolean);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const ema = (values, period) => {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
};

export const detectTrend = (priceHistory, periods = 20) => {
  const candles = priceHistory.slice(-Math.max(periods, 10));
  let higher = 0;
  let lower = 0;
  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (cur.high > prev.high && cur.low > prev.low) higher += 1;
    if (cur.high < prev.high && cur.low < prev.low) lower += 1;
  }
  const total = Math.max(candles.length - 1, 1);
  const upScore = (higher / total) * 100;
  const downScore = (lower / total) * 100;
  if (upScore > 55) {
    return {
      direction: 'up',
      strength: upScore > 75 ? 'strong' : 'moderate',
      confidence: Math.round(upScore),
      description: 'Uptrend with higher highs and higher lows.',
    };
  }
  if (downScore > 55) {
    return {
      direction: 'down',
      strength: downScore > 75 ? 'strong' : 'moderate',
      confidence: Math.round(downScore),
      description: 'Downtrend with lower highs and lower lows.',
    };
  }
  return {
    direction: 'sideways',
    strength: 'weak',
    confidence: 40,
    description: 'Sideways market, no clean direction.',
  };
};

export const findKeyLevels = (priceHistory = []) => {
  const candles = priceHistory.slice(-60);
  const highs = candles.map((c) => Number(c.high || 0)).filter(Boolean);
  const lows = candles.map((c) => Number(c.low || 0)).filter(Boolean);
  const closes = getCloses(candles);
  const current = closes[closes.length - 1] || 0;
  if (!current || !highs.length || !lows.length) {
    return {
      resistance: [],
      support: [],
      currentZone: 'midrange',
      nearestSupport: null,
      nearestResistance: null,
      distanceToSupport: null,
      distanceToResistance: null,
    };
  }

  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const range = maxH - minL;
  const r1 = maxH;
  const r2 = maxH - range * 0.33;
  const s1 = minL + range * 0.33;
  const s2 = minL;

  const supports = [s1, s2].sort((a, b) => b - a);
  const resistances = [r1, r2].sort((a, b) => b - a);

  const nearestSupport = supports.find((s) => s <= current) || supports[supports.length - 1];
  const nearestResistance = resistances.find((r) => r >= current) || resistances[0];
  const distanceToSupport = Math.round(Math.abs((current - nearestSupport) / 0.0001));
  const distanceToResistance = Math.round(Math.abs((nearestResistance - current) / 0.0001));

  let currentZone = 'midrange';
  if (distanceToSupport <= 10) currentZone = 'approaching_support';
  if (distanceToResistance <= 10) currentZone = 'approaching_resistance';

  return {
    resistance: resistances.map((v) => Number(v.toFixed(5))),
    support: supports.map((v) => Number(v.toFixed(5))),
    currentZone,
    nearestSupport: Number(nearestSupport.toFixed(5)),
    nearestResistance: Number(nearestResistance.toFixed(5)),
    distanceToSupport,
    distanceToResistance,
  };
};

export const calculateRSI = (priceHistory, period = 14) => {
  const closes = getCloses(priceHistory);
  if (closes.length < period + 1) return { value: 50, signal: 'neutral', description: 'Not enough RSI data.' };
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 0.0000001;
  const rs = avgGain / avgLoss;
  const value = 100 - 100 / (1 + rs);

  if (value < 30) return { value: Number(value.toFixed(1)), signal: 'buy', description: 'RSI oversold, buy setup.' };
  if (value > 70) return { value: Number(value.toFixed(1)), signal: 'sell', description: 'RSI overbought, sell setup.' };
  if (value >= 40 && value <= 60) return { value: Number(value.toFixed(1)), signal: 'neutral', description: 'RSI neutral momentum.' };
  return {
    value: Number(value.toFixed(1)),
    signal: value < 50 ? 'buy' : 'sell',
    description: value < 50 ? 'RSI below 50, mild buy bias.' : 'RSI above 50, mild sell bias.',
  };
};

export const calculateMAs = (priceHistory = []) => {
  const closes = getCloses(priceHistory);
  if (!closes.length) {
    return {
      ema20: 0,
      ema50: 0,
      sma200: 0,
      priceVsEma20: 'below',
      priceVsEma50: 'below',
      priceVsSma200: 'below',
      ema20VsEma50: 'below',
      signal: 'neutral',
      bullishMAs: 0,
    };
  }
  const price = closes[closes.length - 1];
  const ema20 = ema(closes.slice(-80), 20);
  const ema50 = ema(closes.slice(-160), 50);
  const sma200 = avg(closes.slice(-200));
  const bullish = [price > ema20, price > ema50, price > sma200].filter(Boolean).length;
  const signal = bullish >= 2 ? 'buy' : bullish <= 1 ? 'sell' : 'neutral';

  return {
    ema20: Number(ema20.toFixed(5)),
    ema50: Number(ema50.toFixed(5)),
    sma200: Number(sma200.toFixed(5)),
    priceVsEma20: price >= ema20 ? 'above' : 'below',
    priceVsEma50: price >= ema50 ? 'above' : 'below',
    priceVsSma200: price >= sma200 ? 'above' : 'below',
    ema20VsEma50: ema20 >= ema50 ? 'above' : 'below',
    signal,
    bullishMAs: bullish,
  };
};

export const detectCandlePattern = (candles = []) => {
  const set = candles.slice(-3);
  if (set.length < 2) return { pattern: 'none', signal: 'neutral', strength: 'weak', description: 'No pattern.' };

  const [c1, c2] = set.slice(-2);
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const bullish1 = c1.close > c1.open;
  const bullish2 = c2.close > c2.open;

  if (!bullish1 && bullish2 && c2.close > c1.open && c2.open < c1.close) {
    return { pattern: 'bullish_engulfing', signal: 'buy', strength: 'strong', description: 'Bullish engulfing candle.' };
  }
  if (bullish1 && !bullish2 && c2.open > c1.close && c2.close < c1.open) {
    return { pattern: 'bearish_engulfing', signal: 'sell', strength: 'strong', description: 'Bearish engulfing candle.' };
  }

  const wickTop = c2.high - Math.max(c2.open, c2.close);
  const wickBottom = Math.min(c2.open, c2.close) - c2.low;
  if (wickBottom > body2 * 1.8) {
    return { pattern: 'hammer', signal: 'buy', strength: 'moderate', description: 'Hammer at lower zone.' };
  }
  if (wickTop > body2 * 1.8) {
    return { pattern: 'shooting_star', signal: 'sell', strength: 'moderate', description: 'Shooting star at upper zone.' };
  }

  if (body2 <= (c2.high - c2.low) * 0.15) {
    return { pattern: 'doji', signal: 'wait', strength: 'weak', description: 'Doji indecision candle.' };
  }

  return { pattern: 'none', signal: 'neutral', strength: 'weak', description: 'No clear candle pattern.' };
};

export const isSpreadAcceptable = (spreadPips) => {
  const spread = Number(spreadPips || 0);
  if (spread <= 2) {
    return { acceptable: true, quality: 'excellent', maxRecommendedSL: 20, note: 'Very tight spread.' };
  }
  if (spread <= 3) {
    return { acceptable: true, quality: 'good', maxRecommendedSL: 25, note: 'Good spread for EUR/USD.' };
  }
  if (spread <= 5) {
    return { acceptable: true, quality: 'ok', maxRecommendedSL: 30, note: 'Acceptable, but watch entry.' };
  }
  return { acceptable: false, quality: 'bad', maxRecommendedSL: 50, note: 'Spread too high. Wait.' };
};

export const getMasterTechnicalScore = (priceHistory, currentPrice, spreadPips) => {
  const trend = detectTrend(priceHistory);
  const levels = findKeyLevels(priceHistory);
  const rsi = calculateRSI(priceHistory);
  const ma = calculateMAs(priceHistory);
  const candle = detectCandlePattern(priceHistory.slice(-3));
  const spread = isSpreadAcceptable(spreadPips);

  let score = 0;
  const reasons = [];
  const warnings = [];

  const trendScore = trend.direction === 'sideways' ? 0 : trend.confidence >= 70 ? 25 : 18;
  score += trendScore;
  if (trend.direction !== 'sideways') reasons.push(trend.description);
  else warnings.push('Trend is sideways right now.');

  let levelScore = 0;
  if (levels.currentZone === 'approaching_support' || levels.currentZone === 'approaching_resistance') {
    levelScore = 20;
    reasons.push(
      levels.currentZone === 'approaching_support'
        ? `Price near support ${levels.nearestSupport}`
        : `Price near resistance ${levels.nearestResistance}`
    );
  }
  score += levelScore;

  let rsiScore = 0;
  if (rsi.signal === 'buy' || rsi.signal === 'sell') {
    rsiScore = 15;
    reasons.push(rsi.description);
  }
  score += rsiScore;

  const maScore = ma.bullishMAs === 3 || ma.bullishMAs === 0 ? 20 : ma.bullishMAs === 2 || ma.bullishMAs === 1 ? 12 : 0;
  score += maScore;
  reasons.push(`${ma.bullishMAs}/3 MA alignment`);

  let candleScore = 0;
  if (candle.signal === 'buy' || candle.signal === 'sell') candleScore = candle.strength === 'strong' ? 20 : 12;
  if (candle.signal === 'wait') warnings.push('Doji/indecision candle detected.');
  score += candleScore;

  if (!spread.acceptable) {
    warnings.push(spread.note);
    score = Math.min(score, 45);
  }

  let signal = 'WAIT';
  if (score >= 65) {
    if (trend.direction === 'up') signal = 'BUY';
    else if (trend.direction === 'down') signal = 'SELL';
  }

  const confidence = score >= 75 ? 'HIGH' : score >= 65 ? 'MEDIUM' : score >= 55 ? 'LOW' : 'NO_TRADE';

  return {
    score,
    signal,
    confidence,
    breakdown: {
      trend: { score: trendScore, detail: trend.description },
      levels: {
        score: levelScore,
        detail: `Support ${levels.nearestSupport}, Resistance ${levels.nearestResistance}`,
        nearestSupport: levels.nearestSupport,
        nearestResistance: levels.nearestResistance,
        distanceToSupport: levels.distanceToSupport,
        distanceToResistance: levels.distanceToResistance,
      },
      rsi: { score: rsiScore, detail: rsi.description },
      ma: { score: maScore, detail: `${ma.bullishMAs}/3 bullish MA checks` },
      candle: { score: candleScore, detail: candle.description },
    },
    reasons,
    warnings,
  };
};
