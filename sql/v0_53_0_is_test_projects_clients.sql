-- ============================================================
-- v0.53.0 (s101): テスト系統 is_test 1本化 + 売上3択
-- ============================================================
-- 1. projects.is_test カラム追加(sssas事件の修正)
-- 2. これでテストモードで作った案件も is_test で隔離・一括削除可能
-- ============================================================

BEGIN;

-- 1. projects に is_test カラム追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_projects_is_test ON projects(is_test) WHERE is_test = true;

-- 2. clients にも is_test 追加(SEED取引先・テストモード取引先の隔離用)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_is_test ON clients(is_test) WHERE is_test = true;

COMMIT;

-- ============================================================
-- 確認SQL
-- ============================================================
-- SELECT column_name, table_name FROM information_schema.columns
-- WHERE table_name IN ('projects','clients') AND column_name = 'is_test';
-- → 2行返ればOK
-- ============================================================
