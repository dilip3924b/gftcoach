import { C, IST_TIME_ZONE } from '../lib/constants';
import { getCurrentTradingSession, getLiveForexPrices, isCurrentlyDangerZone } from '../lib/api';

const toIstParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 1, hour, minute, totalMinutes: hour * 60 + minute };
};

const formatIstDateTime = (date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date) + ' IST';

const minutesUntil = (targetDate) => Math.max(0, Math.round((targetDate.getTime() - Date.now()) / 60000));

const nextWeekdayTimeIST = (targetDay, hour, minute) => {
  const now = new Date();
  const nowParts = toIstParts(now);
  let offsetDays = (targetDay - nowParts.day + 7) % 7;
  if (offsetDays === 0) {
    if (nowParts.totalMinutes >= hour * 60 + minute) {
      offsetDays = 7;
    }
  }
  const utcMillis =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour - 5, minute - 30, 0, 0) +
    offsetDays * 24 * 60 * 60 * 1000;
  return new Date(utcMillis);
};

const isWeekendClosed = ({ day, totalMinutes }) => {
  if (day === 6) return true;
  if (day === 0) return true;
  if (day === 5 && totalMinutes >= 22 * 60 + 30) return true;
  if (day === 1 && totalMinutes < 3 * 60 + 30) return true;
  return false;
};

export const isMarketOpen = () => {
  const now = toIstParts();
  if (isWeekendClosed(now)) {
    const nextOpen = getNextMarketOpen();
    return {
      isOpen: false,
      reason: 'Weekend market closure.',
      currentSession: 'closed',
      sessionLabel: '🔴 CLOSED',
      sessionColor: C.red,
      minutesUntilChange: nextOpen.minutesUntilOpen,
      changeEvent: 'Market opens',
    };
  }

  const session = getCurrentTradingSession();
  const open = session.session !== 'dead';

  return {
    isOpen: open,
    reason: open ? 'Forex market open.' : 'Low-liquidity dead zone.',
    currentSession: session.session,
    sessionLabel: session.label,
    sessionColor: open ? session.color : C.muted,
    minutesUntilChange: session.minutesRemaining,
    changeEvent: open ? 'Session change' : 'London opens',
  };
};

export const getNextMarketOpen = () => {
  const now = toIstParts();
  let opensAt;

  if (!isWeekendClosed(now) && now.totalMinutes < 13 * 60 + 30) {
    opensAt = nextWeekdayTimeIST(now.day, 13, 30);
  } else if (now.day >= 1 && now.day <= 4 && now.totalMinutes < 13 * 60 + 30) {
    opensAt = nextWeekdayTimeIST(now.day, 13, 30);
  } else {
    opensAt = nextWeekdayTimeIST(1, 13, 30);
  }

  const mins = minutesUntil(opensAt);
  return {
    opensAt,
    opensAtIST: formatIstDateTime(opensAt),
    hoursUntilOpen: Number((mins / 60).toFixed(1)),
    minutesUntilOpen: mins,
    bestSessionOpensAt: formatIstDateTime(opensAt),
    bestSessionHoursAway: Number((mins / 60).toFixed(1)),
    countdown: `${Math.floor(mins / 60)}h ${mins % 60}m`,
  };
};

export const getNextMarketClose = () => {
  const now = toIstParts();
  const closeToday = nextWeekdayTimeIST(now.day, 22, 30);
  const market = isMarketOpen();
  const mins = minutesUntil(closeToday);
  const isFriday = now.day === 5;
  return {
    closesAt: closeToday,
    closesAtIST: formatIstDateTime(closeToday),
    minutesUntilClose: market.isOpen ? mins : 0,
    isWeekendClose: isFriday,
    warning: isFriday && mins <= 120 ? 'Market closes for weekend in under 2 hours.' : null,
  };
};

export const getWeekSchedule = () => {
  const today = toIstParts().day;
  const base = [
    { day: 1, label: 'Mon', windows: '1:30 PM - 10:30 PM', quality: 'good' },
    { day: 2, label: 'Tue', windows: '1:30 PM - 10:30 PM', quality: 'best' },
    { day: 3, label: 'Wed', windows: '1:30 PM - 10:30 PM', quality: 'best' },
    { day: 4, label: 'Thu', windows: '1:30 PM - 10:30 PM', quality: 'best' },
    { day: 5, label: 'Fri', windows: '1:30 PM - 6:30 PM', quality: 'caution' },
    { day: 6, label: 'Sat', windows: 'Closed', quality: 'closed' },
    { day: 0, label: 'Sun', windows: 'Closed', quality: 'closed' },
  ];

  return base.map((item) => ({
    ...item,
    isToday: item.day === today,
    isPast: item.day < today,
  }));
};

export const getTradingRecommendation = async () => {
  const market = isMarketOpen();
  if (!market.isOpen) {
    const nextOpen = getNextMarketOpen();
    return {
      shouldTrade: false,
      confidence: 'stop',
      color: C.red,
      emoji: '🚫',
      headline: 'Market closed',
      reason: 'Weekend or off-session. No live trading now.',
      nextGoodWindow: nextOpen.opensAtIST,
      blockers: ['Market is closed.'],
    };
  }

  const [danger, prices] = await Promise.all([
    isCurrentlyDangerZone().catch(() => ({ isDanger: false })),
    getLiveForexPrices().catch(() => null),
  ]);

  const spread = Number(prices?.EURUSD?.spread || 0);
  const blockers = [];
  if (danger?.isDanger) blockers.push('Danger news window active.');
  if (spread > 7) blockers.push(`Spread too wide (${spread} pips).`);

  if (blockers.length) {
    return {
      shouldTrade: false,
      confidence: 'wait',
      color: C.orange,
      emoji: '⏳',
      headline: 'Wait for cleaner conditions',
      reason: blockers.join(' '),
      nextGoodWindow: 'After danger window clears',
      blockers,
    };
  }

  return {
    shouldTrade: true,
    confidence: market.currentSession === 'overlap' ? 'go' : 'caution',
    color: market.currentSession === 'overlap' ? C.green : C.yellow,
    emoji: market.currentSession === 'overlap' ? '✅' : '⚠️',
    headline: market.currentSession === 'overlap' ? 'GO - Best trading window live' : 'Tradable, but not peak session',
    reason: market.sessionLabel,
    nextGoodWindow: market.currentSession === 'overlap' ? 'Now' : 'Today 6:30 PM IST',
    blockers: [],
  };
};

export const isScannerAllowedNow = () => {
  const now = toIstParts();
  if (isWeekendClosed(now)) return false;
  if (now.day === 5 && now.totalMinutes >= 18 * 60) return false;
  const session = getCurrentTradingSession();
  return ['london', 'overlap'].includes(session.session);
};
