export const BUSINESS_RULES = {
  ACCOUNT_BALANCE: 1000.0,
  DAILY_LOSS_LIMIT: -30.0,
  MAX_OPEN_LOSS: -20.0,
  PROFIT_GOAL: 100.0,
  PAYOUT_SPLIT: 0.8,
  MIN_WITHDRAWAL: 35.0,
  MAX_WITHDRAWAL: 80.0,
  ACCOUNT_EXPIRY_DAYS: 28,
  LOT_SIZE: 0.01,
  DAILY_TARGET: 5.0,
  MAX_DAILY_PROFIT: 15.0,
  MIN_TRADING_DAYS: 3,
};

export const C = {
  bg: '#080D1A',
  card: '#0F1826',
  card2: '#162033',
  green: '#00FFB0',
  red: '#FF3B5C',
  yellow: '#FFD60A',
  blue: '#3B82F6',
  purple: '#A855F7',
  orange: '#F97316',
  text: '#F8FAFC',
  muted: '#475569',
  border: '#1E293B',
};

export const IST_TIME_ZONE = 'Asia/Kolkata';

export const TRACKED_PAIRS = ['EURUSD', 'AUDUSD', 'GBPUSD', 'USDJPY'];

export const CACHE_KEYS = {
  FOREX_PRICES: 'cache_forex_prices',
  ECON_CALENDAR: 'cache_econ_calendar',
  DANGER_ZONES: 'cache_danger_zones',
};

export const CACHE_TTL_SECONDS = {
  FOREX_PRICE: 30,
  CALENDAR: 3600,
  SPREAD_DATA: 60,
};

export const OFFLINE_QUEUE_KEY = 'offline_queue';

export const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

export const AI_FEATURES = {
  MORNING_BRIEFING: true,
  TRADE_SIGNAL: true,
  TRADE_REVIEW: true,
  DANGER_ALERT: true,
  WEEKLY_REVIEW: true,
  STEP_EXPLAINER: true,
  CHAT_COACH: true,
};

export const AI_CACHE = {
  MORNING_BRIEFING: 3600,
  TRADE_SIGNAL: 30,
  WEEKLY_REVIEW: 86400,
};
