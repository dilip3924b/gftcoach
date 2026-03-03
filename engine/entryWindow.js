import { getAllPrices } from '../lib/priceFeeds';
import { getEntryWindowAI } from '../lib/groq';

export const ENTRY_WINDOWS = {
  IMMEDIATE: {
    name: 'immediate',
    maxMinutes: 1,
    maxPipSlippage: 3,
    label: 'RIGHT NOW',
    urgency: 'now',
  },
  EXTENDED: {
    name: 'extended',
    maxMinutes: 5,
    maxPipSlippage: 8,
    label: 'STILL VALID',
    urgency: 'hurry',
  },
  LATE: {
    name: 'late',
    maxMinutes: 15,
    maxPipSlippage: 15,
    label: 'LATE ENTRY',
    urgency: 'caution',
  },
  EXPIRED: {
    name: 'expired',
    label: 'SIGNAL EXPIRED',
    urgency: 'skip',
  },
};

const parseRange = (range) => {
  if (!range || typeof range !== 'string') return null;
  const nums = (range.match(/[0-9]+(?:\.[0-9]+)?/g) || []).map(Number);
  if (nums.length < 2) return null;
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
};

const formatCountdown = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const symbolMeta = (symbol) => {
  const s = String(symbol || 'EURUSD').replace('/', '').toUpperCase();
  if (s.includes('XAU')) return { code: 'XAUUSD', pipSize: 1, unitValue: 0.01, decimals: 2, rangePad: 5, unit: 'dollar move' };
  if (s.includes('BTC')) return { code: 'BTCUSD', pipSize: 1, unitValue: 0.01, decimals: 2, rangePad: 50, unit: 'dollar move' };
  return { code: 'EURUSD', pipSize: 0.0001, unitValue: 0.1, decimals: 5, rangePad: 0.0005, unit: 'pips' };
};

const recalculateRiskFromNewEntry = (direction, newEntry, originalSL, meta) => {
  const adjustedSlPips = Math.max(1, Math.round(Math.abs(newEntry - originalSL) / meta.pipSize));
  const adjustedTpPips = Math.round(adjustedSlPips * 2.0);
  const adjustedTP = direction === 'BUY'
    ? newEntry + adjustedTpPips * meta.pipSize
    : newEntry - adjustedTpPips * meta.pipSize;

  return {
    adjustedSL: originalSL,
    adjustedTP,
    adjustedSlPips,
    adjustedTpPips,
  };
};

const getWindowByTiming = (minutesSinceSignal, pipsFromOriginal, symbolCode = 'EURUSD') => {
  const limits = symbolCode === 'BTCUSD'
    ? { immediate: 120, extended: 300, late: 600 }
    : symbolCode === 'XAUUSD'
      ? { immediate: 5, extended: 15, late: 35 }
      : {
          immediate: ENTRY_WINDOWS.IMMEDIATE.maxPipSlippage,
          extended: ENTRY_WINDOWS.EXTENDED.maxPipSlippage,
          late: ENTRY_WINDOWS.LATE.maxPipSlippage,
        };
  if (minutesSinceSignal <= ENTRY_WINDOWS.IMMEDIATE.maxMinutes && pipsFromOriginal <= limits.immediate) {
    return ENTRY_WINDOWS.IMMEDIATE;
  }
  if (minutesSinceSignal <= ENTRY_WINDOWS.EXTENDED.maxMinutes && pipsFromOriginal <= limits.extended) {
    return ENTRY_WINDOWS.EXTENDED;
  }
  if (minutesSinceSignal <= ENTRY_WINDOWS.LATE.maxMinutes && pipsFromOriginal <= limits.late) {
    return ENTRY_WINDOWS.LATE;
  }
  return ENTRY_WINDOWS.EXPIRED;
};

export const evaluateEntryStatus = async (signal, currentPrice) => {
  if (!signal || !['BUY', 'SELL'].includes(signal.signal)) {
    return {
      window: 'expired',
      canStillEnter: false,
      shouldEnter: false,
      urgency: 'skip',
      windowLabel: 'SIGNAL EXPIRED',
      aiGuidance: 'No actionable BUY/SELL signal available.',
    };
  }

  const meta = symbolMeta(signal?.symbol);
  const signalTs = new Date(signal.generatedAt || signal.generated_at || Date.now()).getTime();
  const minutesSinceSignal = (Date.now() - signalTs) / 60000;

  const parsed = parseRange(signal.entry?.range);
  const originalMid = parsed
    ? (parsed.min + parsed.max) / 2
    : Number(signal.entry?.price || 0);

  const live = signal.signal === 'BUY'
    ? Number(currentPrice?.ask || currentPrice?.bid || originalMid)
    : Number(currentPrice?.bid || currentPrice?.ask || originalMid);

  const pipsFromOriginal = originalMid ? Math.abs(live - originalMid) / meta.pipSize : 999;
  const window = getWindowByTiming(minutesSinceSignal, pipsFromOriginal, meta.code);

  if (window.name === 'expired') {
    return {
      window: 'expired',
      windowLabel: window.label,
      canStillEnter: false,
      shouldEnter: false,
      urgency: window.urgency,
      minutesSinceSignal: Math.round(minutesSinceSignal),
      pipsFromOriginal: Math.round(pipsFromOriginal),
      aiGuidance: 'This signal expired. Wait for the next setup.',
    };
  }

  const originalSL = Number(signal.stopLoss?.price || 0);
  const { adjustedSL, adjustedTP, adjustedSlPips, adjustedTpPips } = recalculateRiskFromNewEntry(signal.signal, live, originalSL, meta);
  const rrRatio = adjustedTpPips / adjustedSlPips;
  const rrRatioStillGood = rrRatio >= 1.8;
  const secondsRemaining = Math.max(0, ENTRY_WINDOWS.EXTENDED.maxMinutes * 60 - minutesSinceSignal * 60);

  const ai = await getEntryWindowAI(
    signal,
    window,
    minutesSinceSignal,
    pipsFromOriginal,
    live,
    adjustedSL,
    adjustedTP,
    rrRatio
  ).catch(() => ({ content: null }));

  return {
    window: window.name,
    windowLabel: window.label,
    canStillEnter: true,
    shouldEnter: rrRatioStillGood,
    urgency: window.urgency,
    originalEntry: {
      price: Number(originalMid.toFixed(5)),
      range: signal.entry?.range || `${originalMid.toFixed(5)}`,
    },
    currentEntry: {
      price: Number(live.toFixed(meta.decimals)),
      range: `${(live - meta.rangePad).toFixed(meta.decimals)} - ${(live + meta.rangePad).toFixed(meta.decimals)}`,
    },
    entryMoved: pipsFromOriginal > 2,
    pipsFromOriginal: Math.round(pipsFromOriginal),
    adjustedSL: Number(adjustedSL.toFixed(meta.decimals)),
    adjustedTP: Number(adjustedTP.toFixed(meta.decimals)),
    adjustedSlPips,
    adjustedTpPips,
    rrRatioStillGood,
    rrRatio: Number(rrRatio.toFixed(1)),
    minutesSinceSignal: Math.round(minutesSinceSignal),
    secondsRemaining: Math.round(secondsRemaining),
    countdownDisplay: formatCountdown(secondsRemaining),
    riskIfEnterNow: Number((adjustedSlPips * meta.unitValue).toFixed(2)),
    rewardIfEnterNow: Number((adjustedTpPips * meta.unitValue).toFixed(2)),
    distanceUnit: meta.unit,
    aiGuidance: ai?.content || null,
  };
};

export const evaluateEntryStatusFromLivePrice = async (signal) => {
  const prices = await getAllPrices();
  const symbol = symbolMeta(signal?.symbol).code;
  return evaluateEntryStatus(signal, prices?.[symbol] || prices?.EURUSD || {});
};
