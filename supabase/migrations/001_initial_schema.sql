-- ═══════════════════════════════════════════════════════════════
-- komu10 会計・事業管理システム v0.3
-- Initial Schema Migration
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- profiles: ユーザー情報
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  theme TEXT DEFAULT 'light',
  gas_api_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- projects: プロジェクト（案件・YouTube企画等）
-- ※ transactions より先に作成（FK参照のため）
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  division TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES profiles(user_key),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('ordered', 'active', 'completed')),
  client TEXT,
  youtube_id TEXT,
  category TEXT,
  location TEXT,
  shoot_date DATE,
  publish_date DATE,
  budget INTEGER,
  target_revenue INTEGER,
  note TEXT,
  tags TEXT[] DEFAULT '{}',
  external_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- transactions: 取引（売上・経費）
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tx_type TEXT NOT NULL CHECK (tx_type IN ('expense', 'revenue')),
  date DATE NOT NULL,
  amount INTEGER NOT NULL,
  kamoku TEXT NOT NULL,
  division TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES profiles(user_key),
  store TEXT,
  description TEXT,
  memo TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  revenue_type TEXT,
  source TEXT DEFAULT 'manual',
  ai_confidence REAL,
  confirmed BOOLEAN DEFAULT TRUE,
  external_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- assets: 固定資産台帳
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('camera', 'lens', 'pc', 'drone', 'other')),
  owner TEXT NOT NULL REFERENCES profiles(user_key),
  acquisition_date DATE NOT NULL,
  acquisition_cost INTEGER NOT NULL,
  useful_life INTEGER NOT NULL,
  business_use_ratio INTEGER DEFAULT 100 CHECK (business_use_ratio >= 0 AND business_use_ratio <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- anbun_settings: 按分設定
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE anbun_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kamoku TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES profiles(user_key),
  ratio INTEGER NOT NULL CHECK (ratio >= 0 AND ratio <= 100),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (kamoku, owner)
);

-- ─────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_owner ON transactions(owner);
CREATE INDEX idx_transactions_division ON transactions(division);
CREATE INDEX idx_transactions_kamoku ON transactions(kamoku);
CREATE INDEX idx_projects_owner ON projects(owner);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_division ON projects(division);
CREATE INDEX idx_assets_owner ON assets(owner);
CREATE INDEX idx_anbun_owner ON anbun_settings(owner);

-- ─────────────────────────────────────────────────────────────────
-- updated_at 自動更新トリガー
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_anbun_settings_updated_at
  BEFORE UPDATE ON anbun_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
