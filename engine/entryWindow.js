import { getLiveForexPrices } from '../lib/api';
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

const recalculateRiskFromNewEntry = (direction, newEntry, originalSL) => {
  const adjustedSlPips = Math.max(1, Math.round(Math.abs(newEntry - originalSL) / 0.0001));
  const adjustedTpPips = Math.round(adjustedSlPips * 2.0);
  const adjustedTP = direction === 'BUY'
    ? newEntry + adjustedTpPips * 0.0001
    : newEntry - adjustedTpPips * 0.0001;

  return {
    adjustedSL: originalSL,
    adjustedTP,
    adjustedSlPips,
    adjustedTpPips,
  };
};

const getWindowByTiming = (minutesSinceSignal, pipsFromOriginal) => {
  if (minutesSinceSignal <= ENTRY_WINDOWS.IMMEDIATE.maxMinutes && pipsFromOriginal <= ENTRY_WINDOWS.IMMEDIATE.maxPipSlippage) {
    return ENTRY_WINDOWS.IMMEDIATE;
  }
  if (minutesSinceSignal <= ENTRY_WINDOWS.EXTENDED.maxMinutes && pipsFromOriginal <= ENTRY_WINDOWS.EXTENDED.maxPipSlippage) {
    return ENTRY_WINDOWS.EXTENDED;
  }
  if (minutesSinceSignal <= ENTRY_WINDOWS.LATE.maxMinutes && pipsFromOriginal <= ENTRY_WINDOWS.LATE.maxPipSlippage) {
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

  const signalTs = new Date(signal.generatedAt || signal.generated_at || Date.now()).getTime();
  const minutesSinceSignal = (Date.now() - signalTs) / 60000;

  const parsed = parseRange(signal.entry?.range);
  const originalMid = parsed
    ? (parsed.min + parsed.max) / 2
    : Number(signal.entry?.price || 0);

  const live = signal.signal === 'BUY'
    ? Number(currentPrice?.ask || currentPrice?.bid || originalMid)
    : Number(currentPrice?.bid || currentPrice?.ask || originalMid);

  const pipsFromOriginal = originalMid ? Math.abs(live - originalMid) / 0.0001 : 999;
  const window = getWindowByTiming(minutesSinceSignal, pipsFromOriginal);

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
  const { adjustedSL, adjustedTP, adjustedSlPips, adjustedTpPips } = recalculateRiskFromNewEntry(signal.signal, live, originalSL);
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
      price: Number(live.toFixed(5)),
      range: `${(live - 0.0005).toFixed(5)} - ${(live + 0.0005).toFixed(5)}`,
    },
    entryMoved: pipsFromOriginal > 2,
    pipsFromOriginal: Math.round(pipsFromOriginal),
    adjustedSL: Number(adjustedSL.toFixed(5)),
    adjustedTP: Number(adjustedTP.toFixed(5)),
    adjustedSlPips,
    adjustedTpPips,
    rrRatioStillGood,
    rrRatio: Number(rrRatio.toFixed(1)),
    minutesSinceSignal: Math.round(minutesSinceSignal),
    secondsRemaining: Math.round(secondsRemaining),
    countdownDisplay: formatCountdown(secondsRemaining),
    riskIfEnterNow: Number((adjustedSlPips * 0.1).toFixed(2)),
    rewardIfEnterNow: Number((adjustedTpPips * 0.1).toFixed(2)),
    aiGuidance: ai?.content || null,
  };
};

export const evaluateEntryStatusFromLivePrice = async (signal) => {
  const prices = await getLiveForexPrices();
  return evaluateEntryStatus(signal, prices?.EURUSD || {});
};
