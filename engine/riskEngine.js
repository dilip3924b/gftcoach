const PROFILES = {
  EURUSD: { pipSize: 0.0001, unitValue: 0.10, unit: 'pips', maxSL: 50, minRR: 2.0, decimals: 5 },
  XAUUSD: { pipSize: 1.0, unitValue: 0.01, unit: 'dollars', maxSL: 500, minRR: 2.0, decimals: 2 },
  BTCUSD: { pipSize: 1.0, unitValue: 0.01, unit: 'dollars', maxSL: 1500, minRR: 2.0, decimals: 2 },
};

const symbolFromInput = (v) => {
  const s = String(v || 'EURUSD').replace('/', '').toUpperCase();
  if (s.includes('XAU')) return 'XAUUSD';
  if (s.includes('BTC')) return 'BTCUSD';
  return 'EURUSD';
};

export const calculateATR = (candles, period = 14) => {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const slice = candles.slice(-(period + 1));
  const trs = slice.slice(1).map((c, i) => {
    const prev = Number(slice[i].close || 0);
    const high = Number(c.high || 0);
    const low = Number(c.low || 0);
    return Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
};

const buildRange = (symbol, direction, entry) => {
  const pad = symbol === 'EURUSD' ? 0.0005 : symbol === 'XAUUSD' ? 5 : 50;
  const d = PROFILES[symbol].decimals;
  return direction === 'BUY'
    ? `${(entry - pad).toFixed(d)} - ${entry.toFixed(d)}`
    : `${entry.toFixed(d)} - ${(entry + pad).toFixed(d)}`;
};

const normalizeLegacyInput = (input) => {
  // Backward compatibility with old caller shape.
  if (input && typeof input === 'object' && input.entryPrice) {
    return {
      symbol: 'EURUSD',
      direction: input.direction,
      currentPrice: {
        bid: Number(input.entryPrice || 0),
        ask: Number(input.entryPrice || 0),
      },
      candles: [],
      spreadPips: Number(input.spreadPips || 0),
    };
  }
  return input;
};

export const calculateRiskParams = (...args) => {
  const raw = args.length === 1 ? normalizeLegacyInput(args[0]) : {
    symbol: args[0],
    direction: args[1],
    currentPrice: args[2],
    candles: args[3] || [],
  };

  const symbol = symbolFromInput(raw?.symbol);
  const direction = raw?.direction === 'SELL' ? 'SELL' : 'BUY';
  const p = PROFILES[symbol];
  const currentPrice = raw?.currentPrice || {};
  const entry = direction === 'BUY' ? Number(currentPrice.ask || currentPrice.bid || 0) : Number(currentPrice.bid || currentPrice.ask || 0);

  const atr = calculateATR(raw?.candles || []);
  let slDist;

  if (symbol === 'EURUSD') {
    slDist = atr ? Math.min(Math.round((atr / p.pipSize) * 1.2), p.maxSL) : 25;
  } else if (symbol === 'XAUUSD') {
    slDist = atr ? Math.min(Math.round(atr * 1.2), p.maxSL) : 120;
  } else {
    slDist = atr ? Math.min(Math.round(atr * 1.2), p.maxSL) : 700;
  }

  slDist = Math.max(5, slDist);
  const tpDist = Math.round(slDist * p.minRR);

  const stopLoss = direction === 'BUY'
    ? Number((entry - slDist * p.pipSize).toFixed(p.decimals))
    : Number((entry + slDist * p.pipSize).toFixed(p.decimals));

  const takeProfit = direction === 'BUY'
    ? Number((entry + tpDist * p.pipSize).toFixed(p.decimals))
    : Number((entry - tpDist * p.pipSize).toFixed(p.decimals));

  const maxLoss = Number((slDist * p.unitValue).toFixed(2));
  const potentialGain = Number((tpDist * p.unitValue).toFixed(2));
  const rrRatio = Number((tpDist / slDist).toFixed(1));

  return {
    symbol,
    direction,
    lotSize: 0.01,
    entry: Number(entry.toFixed(p.decimals)),
    entryRange: buildRange(symbol, direction, entry),
    entryDisplay: symbol === 'EURUSD'
      ? entry.toFixed(5)
      : `$${entry.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    stopLoss,
    takeProfit,
    slDistance: slDist,
    tpDistance: tpDist,
    // Backward-compatible keys used in existing code paths.
    slPips: slDist,
    tpPips: tpDist,
    unit: p.unit,
    unitLabel: symbol === 'EURUSD' ? `${slDist} pips` : `$${slDist} move`,
    tpLabel: symbol === 'EURUSD' ? `${tpDist} pips` : `$${tpDist} move`,
    maxLoss,
    potentialGain,
    rrRatio,
    riskPercent: Number(((maxLoss / 1000) * 100).toFixed(2)),
    pipValue: p.unitValue,
  };
};

export const checkDailyLimitSafe = (todayPL, maxLoss) => {
  const projected = Number((Number(todayPL || 0) - Number(maxLoss || 0)).toFixed(2));
  const safe = projected >= -30;
  return {
    safe,
    remaining: Number((30 + Number(todayPL || 0)).toFixed(2)),
    projectedWorst: projected,
    message: safe
      ? `Safe. Can lose up to $${(30 + Number(todayPL || 0)).toFixed(2)} more today`
      : `Cannot trade - worst case: -$${Math.abs(projected).toFixed(2)} today (limit: -$30)`,
  };
};
