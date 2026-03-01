CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  account_start_date TIMESTAMPTZ DEFAULT NOW(),
  total_profit DECIMAL(10,2) DEFAULT 0.00,
  goal_amount DECIMAL(10,2) DEFAULT 100.00,
  account_balance DECIMAL(10,2) DEFAULT 1000.00
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TABLE trades (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  pair TEXT NOT NULL DEFAULT 'EUR/USD',
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  profit DECIMAL(10,2) NOT NULL,
  note TEXT,
  traded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_traded_at ON trades(traded_at);

CREATE TABLE guide_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  phase_index INTEGER DEFAULT 0,
  step_index INTEGER DEFAULT 0,
  answers JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_stats (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stat_date DATE DEFAULT CURRENT_DATE,
  total_pl DECIMAL(10,2) DEFAULT 0.00,
  trades_count INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stat_date)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own trades" ON trades
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON trades
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trades" ON trades
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own progress" ON guide_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own stats" ON daily_stats
  FOR ALL USING (auth.uid() = user_id);
