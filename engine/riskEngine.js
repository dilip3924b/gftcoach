const LOT_SIZE = 0.01;
const PIP_VALUE = 0.1;
const MAX_RISK_USD = 5.0;
const MIN_RR_RATIO = 2.0;

export const calculateRiskParams = ({
  direction,
  entryPrice,
  nearestSupport,
  nearestResistance,
  spreadPips,
}) => {
  const entry = Number(entryPrice || 0);
  const support = Number(nearestSupport || entry - 0.002);
  const resistance = Number(nearestResistance || entry + 0.002);
  const bufferPips = spreadPips > 3 ? 6 : 5;

  let stopLoss = entry;
  let slPips = 25;
  let tpPips = 50;
  let takeProfit = entry;

  if (direction === 'BUY') {
    stopLoss = support - bufferPips * 0.0001;
    slPips = Math.max(20, Math.round((entry - stopLoss) / 0.0001));
    tpPips = Math.max(Math.round(slPips * MIN_RR_RATIO), 40);
    takeProfit = entry + tpPips * 0.0001;
  } else {
    stopLoss = resistance + bufferPips * 0.0001;
    slPips = Math.max(20, Math.round((stopLoss - entry) / 0.0001));
    tpPips = Math.max(Math.round(slPips * MIN_RR_RATIO), 40);
    takeProfit = entry - tpPips * 0.0001;
  }

  const maxAllowedPips = Math.floor(MAX_RISK_USD / PIP_VALUE);
  if (slPips > maxAllowedPips) {
    slPips = maxAllowedPips;
    tpPips = Math.max(Math.round(slPips * MIN_RR_RATIO), 40);
    stopLoss = direction === 'BUY' ? entry - slPips * 0.0001 : entry + slPips * 0.0001;
    takeProfit = direction === 'BUY' ? entry + tpPips * 0.0001 : entry - tpPips * 0.0001;
  }

  const maxLoss = Number((slPips * PIP_VALUE).toFixed(2));
  const potentialGain = Number((tpPips * PIP_VALUE).toFixed(2));
  const rrRatio = Number((tpPips / slPips).toFixed(1));

  return {
    lotSize: LOT_SIZE,
    entry: Number(entry.toFixed(5)),
    entryRange:
      direction === 'BUY'
        ? `${(entry - 0.001).toFixed(5)} - ${entry.toFixed(5)}`
        : `${entry.toFixed(5)} - ${(entry + 0.001).toFixed(5)}`,
    stopLoss: Number(stopLoss.toFixed(5)),
    takeProfit: Number(takeProfit.toFixed(5)),
    slPips,
    tpPips,
    rrRatio,
    maxLoss,
    potentialGain,
    riskPercent: Number(((maxLoss / 1000) * 100).toFixed(2)),
    isWithinDailyLimit: true,
    pipValue: PIP_VALUE,
  };
};

export const checkDailyLimitSafe = (todayPL, maxLoss) => {
  const projectedWorst = Number(todayPL || 0) - Number(maxLoss || 0);
  const safe = projectedWorst >= -30;
  return {
    safe,
    remaining: Number((30 + Number(todayPL || 0)).toFixed(2)),
    projectedWorst: Number(projectedWorst.toFixed(2)),
    message: safe
      ? `Safe to trade. You can lose up to $${(30 + Number(todayPL || 0)).toFixed(2)} more today.`
      : `Cannot trade: daily limit would be exceeded (projected ${projectedWorst.toFixed(2)}).`,
  };
};
