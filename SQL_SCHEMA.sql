-- =====================================================
-- GFT COACH - COMPLETE SCHEMA (PASTE ONCE)
-- Includes base app + AI + zero-knowledge engine tables
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------
-- TABLE: profiles
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                 UUID REFERENCES auth.users(id) PRIMARY KEY,
  email              TEXT NOT NULL,
  display_name       TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  account_start_date TIMESTAMPTZ DEFAULT NOW(),
  total_profit       DECIMAL(10,2) DEFAULT 0.00,
  goal_amount        DECIMAL(10,2) DEFAULT 100.00,
  account_balance    DECIMAL(10,2) DEFAULT 1000.00,
  account_expired    BOOLEAN DEFAULT FALSE,
  days_traded        INTEGER DEFAULT 0,
  timezone           TEXT DEFAULT 'Asia/Kolkata'
);

-- -----------------------------------------------------
-- TABLE: trades
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  symbol      TEXT DEFAULT 'EURUSD' CHECK (symbol IN ('EURUSD', 'XAUUSD', 'BTCUSD')),
  asset_class TEXT DEFAULT 'forex' CHECK (asset_class IN ('forex', 'commodity', 'crypto')),
  pair        TEXT NOT NULL DEFAULT 'EUR/USD'
              CHECK (pair IN ('EUR/USD', 'AUD/USD', 'GBP/USD', 'USD/JPY')),
  direction   TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  profit      DECIMAL(10,2) NOT NULL,
  lot_size    DECIMAL(5,3) DEFAULT 0.01 CHECK (lot_size = 0.01),
  note        TEXT,
  entry_price DECIMAL(10,5),
  exit_price  DECIMAL(10,5),
  stop_loss   DECIMAL(10,5),
  take_profit DECIMAL(10,5),
  outcome     TEXT CHECK (outcome IN ('WIN', 'LOSS', 'BREAKEVEN')),
  traded_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  local_id    TEXT UNIQUE,
  synced      BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_trades_user_id   ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_traded_at ON trades(traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_local_id  ON trades(local_id);

-- -----------------------------------------------------
-- TABLE: guide_progress
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS guide_progress (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  phase_index     INTEGER DEFAULT 0 CHECK (phase_index >= 0 AND phase_index <= 5),
  step_index      INTEGER DEFAULT 0 CHECK (step_index >= 0),
  answers         JSONB DEFAULT '{}',
  completed_steps INTEGER DEFAULT 0,
  last_completed  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------
-- TABLE: daily_stats
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_stats (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stat_date       DATE DEFAULT CURRENT_DATE,
  total_pl        DECIMAL(10,2) DEFAULT 0.00,
  trades_count    INTEGER DEFAULT 0,
  wins            INTEGER DEFAULT 0,
  losses          INTEGER DEFAULT 0,
  largest_win     DECIMAL(10,2) DEFAULT 0.00,
  largest_loss    DECIMAL(10,2) DEFAULT 0.00,
  daily_limit_hit BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date DESC);

-- -----------------------------------------------------
-- TABLE: market_cache
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS market_cache (
  id         BIGSERIAL PRIMARY KEY,
  cache_key  TEXT UNIQUE NOT NULL,
  data       JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_cache_key     ON market_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_market_cache_expires ON market_cache(expires_at);

-- -----------------------------------------------------
-- TABLE: sync_queue
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('ADD_TRADE', 'UPDATE_PROGRESS', 'UPDATE_STATS')),
  payload    JSONB NOT NULL,
  attempts   INTEGER DEFAULT 0,
  synced     BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------
-- TABLE: signals (zero-knowledge engine)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID REFERENCES profiles(id) ON DELETE CASCADE,
  symbol             TEXT DEFAULT 'EURUSD' CHECK (symbol IN ('EURUSD', 'XAUUSD', 'BTCUSD')),
  asset_class        TEXT DEFAULT 'forex' CHECK (asset_class IN ('forex', 'commodity', 'crypto')),
  pair               TEXT DEFAULT 'EUR/USD',
  direction          TEXT CHECK (direction IN ('BUY', 'SELL', 'WAIT')),
  confidence         TEXT CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  entry_price        DECIMAL(10,5),
  entry_range        TEXT,
  stop_loss          DECIMAL(10,5),
  take_profit        DECIMAL(10,5),
  sl_pips            INTEGER,
  tp_pips            INTEGER,
  technical_score    INTEGER,
  news_sentiment     TEXT,
  news_score         DECIMAL(3,2),
  thinking_report    JSONB,
  dxy_value          DECIMAL(6,3),
  fear_greed_index   INTEGER,
  reasons            JSONB,
  warnings           JSONB,
  simple_explanation TEXT,
  valid_until        TIMESTAMPTZ,
  was_traded         BOOLEAN DEFAULT FALSE,
  user_opened_at     TIMESTAMPTZ,
  user_entry_window  TEXT,
  actual_entry_price DECIMAL(10,5),
  entry_pip_slippage INTEGER,
  outcome            TEXT CHECK (outcome IN ('WIN', 'LOSS', 'EXPIRED', 'SKIPPED')),
  generated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_user ON signals(user_id, generated_at DESC);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_opened_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_entry_window TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS actual_entry_price DECIMAL(10,5);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS entry_pip_slippage INTEGER;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS symbol TEXT DEFAULT 'EURUSD' CHECK (symbol IN ('EURUSD', 'XAUUSD', 'BTCUSD'));
ALTER TABLE signals ADD COLUMN IF NOT EXISTS asset_class TEXT DEFAULT 'forex' CHECK (asset_class IN ('forex', 'commodity', 'crypto'));
ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_sentiment TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_score DECIMAL(3,2);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS thinking_report JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS dxy_value DECIMAL(6,3);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS fear_greed_index INTEGER;

ALTER TABLE trades ADD COLUMN IF NOT EXISTS symbol TEXT DEFAULT 'EURUSD' CHECK (symbol IN ('EURUSD', 'XAUUSD', 'BTCUSD'));
ALTER TABLE trades ADD COLUMN IF NOT EXISTS asset_class TEXT DEFAULT 'forex' CHECK (asset_class IN ('forex', 'commodity', 'crypto'));

-- -----------------------------------------------------
-- TABLE: active_trade (zero-knowledge engine)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS active_trade (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  signal_id   BIGINT REFERENCES signals(id),
  pair        TEXT DEFAULT 'EUR/USD',
  direction   TEXT,
  entry_price DECIMAL(10,5),
  stop_loss   DECIMAL(10,5),
  take_profit DECIMAL(10,5),
  lot_size    DECIMAL(5,3) DEFAULT 0.01,
  placed_at   TIMESTAMPTZ DEFAULT NOW(),
  close_before TIMESTAMPTZ,
  status      TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  close_price DECIMAL(10,5),
  close_reason TEXT,
  actual_profit DECIMAL(10,2)
);

-- -----------------------------------------------------
-- TABLE: user_preferences (onboarding/settings)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  availability_start  TEXT DEFAULT '18:30',
  availability_end    TEXT DEFAULT '22:30',
  mt5_installed       BOOLEAN DEFAULT FALSE,
  onboarding_done     BOOLEAN DEFAULT FALSE,
  notification_trade  BOOLEAN DEFAULT TRUE,
  notification_danger BOOLEAN DEFAULT TRUE,
  notification_daily  BOOLEAN DEFAULT TRUE,
  preferred_assets    TEXT[] DEFAULT '{"EURUSD"}',
  btcusd_enabled      BOOLEAN DEFAULT FALSE,
  xauusd_enabled      BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_assets TEXT[] DEFAULT '{"EURUSD"}';
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS btcusd_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS xauusd_enabled BOOLEAN DEFAULT FALSE;

-- -----------------------------------------------------
-- FUNCTIONS + TRIGGERS
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guide_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION update_total_profit()
RETURNS TRIGGER AS $$
DECLARE
  target_user UUID;
BEGIN
  target_user := COALESCE(NEW.user_id, OLD.user_id);

  UPDATE profiles
  SET total_profit = (
    SELECT COALESCE(SUM(profit), 0)
    FROM trades
    WHERE user_id = target_user
  )
  WHERE id = target_user;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trade_inserted ON trades;
CREATE TRIGGER on_trade_inserted
  AFTER INSERT OR UPDATE OR DELETE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_total_profit();

CREATE OR REPLACE FUNCTION update_daily_stats()
RETURNS TRIGGER AS $$
DECLARE
  trade_date DATE;
BEGIN
  trade_date := DATE(NEW.traded_at);

  INSERT INTO daily_stats (user_id, stat_date, total_pl, trades_count, wins, losses)
  VALUES (
    NEW.user_id,
    trade_date,
    NEW.profit,
    1,
    CASE WHEN NEW.profit > 0 THEN 1 ELSE 0 END,
    CASE WHEN NEW.profit < 0 THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, stat_date) DO UPDATE SET
    total_pl       = daily_stats.total_pl + NEW.profit,
    trades_count   = daily_stats.trades_count + 1,
    wins           = daily_stats.wins + CASE WHEN NEW.profit > 0 THEN 1 ELSE 0 END,
    losses         = daily_stats.losses + CASE WHEN NEW.profit < 0 THEN 1 ELSE 0 END,
    largest_win    = GREATEST(daily_stats.largest_win, CASE WHEN NEW.profit > 0 THEN NEW.profit ELSE 0 END),
    largest_loss   = LEAST(daily_stats.largest_loss, CASE WHEN NEW.profit < 0 THEN NEW.profit ELSE 0 END),
    daily_limit_hit = CASE WHEN (daily_stats.total_pl + NEW.profit) <= -30 THEN TRUE ELSE FALSE END,
    updated_at     = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trade_for_daily_stats ON trades;
CREATE TRIGGER on_trade_for_daily_stats
  AFTER INSERT ON trades
  FOR EACH ROW EXECUTE FUNCTION update_daily_stats();

-- -----------------------------------------------------
-- RLS
-- -----------------------------------------------------
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_trade     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- drop old policies if they already exist
DROP POLICY IF EXISTS own_profile_select ON profiles;
DROP POLICY IF EXISTS own_profile_update ON profiles;
DROP POLICY IF EXISTS own_profile_insert ON profiles;
DROP POLICY IF EXISTS own_trades_select ON trades;
DROP POLICY IF EXISTS own_trades_insert ON trades;
DROP POLICY IF EXISTS own_trades_update ON trades;
DROP POLICY IF EXISTS own_trades_delete ON trades;
DROP POLICY IF EXISTS own_progress_all ON guide_progress;
DROP POLICY IF EXISTS own_stats_all ON daily_stats;
DROP POLICY IF EXISTS own_queue_all ON sync_queue;
DROP POLICY IF EXISTS market_cache_read ON market_cache;
DROP POLICY IF EXISTS market_cache_write ON market_cache;
DROP POLICY IF EXISTS own_signals_all ON signals;
DROP POLICY IF EXISTS own_trade_all ON active_trade;
DROP POLICY IF EXISTS own_prefs_all ON user_preferences;

CREATE POLICY own_profile_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY own_profile_update ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY own_profile_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY own_trades_select ON trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_trades_insert ON trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_trades_update ON trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY own_trades_delete ON trades FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY own_progress_all ON guide_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY own_stats_all ON daily_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY own_queue_all ON sync_queue FOR ALL USING (auth.uid() = user_id);

CREATE POLICY market_cache_read ON market_cache FOR SELECT USING (TRUE);
CREATE POLICY market_cache_write ON market_cache FOR ALL USING (TRUE);

CREATE POLICY own_signals_all ON signals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY own_trade_all ON active_trade FOR ALL USING (auth.uid() = user_id);
CREATE POLICY own_prefs_all ON user_preferences FOR ALL USING (auth.uid() = user_id);
