-- ============================================================
-- komu10 v0.11.0: 複数領収書添付機能
-- 実行場所: Supabase SQL Editor
-- 前提: audit_log.sql 実行済
-- ============================================================

CREATE TABLE expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL CHECK (seq_no BETWEEN 1 AND 10),
  label TEXT,
  drive_file_id TEXT NOT NULL,
  drive_url TEXT NOT NULL,
  drive_folder_path TEXT,
  generated_filename TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  ai_extracted_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id, seq_no)
);

CREATE INDEX idx_expense_receipts_transaction ON expense_receipts(transaction_id);
CREATE INDEX idx_expense_receipts_drive_file ON expense_receipts(drive_file_id);
CREATE INDEX idx_expense_receipts_created_at ON expense_receipts(created_at DESC);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_expense_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_receipts_updated_at
  BEFORE UPDATE ON expense_receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_expense_receipts_updated_at();

-- 監査ログ（audit_log 既存パターン）
CREATE OR REPLACE FUNCTION audit_expense_receipts_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_fields TEXT[] := '{}';
  v_old_json JSONB;
  v_new_json JSONB;
  v_owner TEXT;
BEGIN
  v_old_json := to_jsonb(OLD);
  SELECT owner INTO v_owner FROM transactions WHERE id = OLD.transaction_id;

  IF TG_OP = 'UPDATE' THEN
    v_new_json := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_each(v_old_json) AS o(key, value)
      FULL OUTER JOIN jsonb_each(v_new_json) AS n(key, value) USING (key)
      WHERE o.value IS DISTINCT FROM n.value AND key NOT IN ('updated_at')
    ) diff;
    IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_log (table_name, record_id, operation, old_data, new_data, changed_fields, changed_by)
    VALUES ('expense_receipts', OLD.id, 'UPDATE', v_old_json, v_new_json, v_changed_fields, v_owner);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, operation, old_data, new_data, changed_fields, changed_by)
    VALUES ('expense_receipts', OLD.id, 'DELETE', v_old_json, NULL, NULL, v_owner);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_expense_receipts
  BEFORE UPDATE OR DELETE ON expense_receipts
  FOR EACH ROW
  EXECUTE FUNCTION audit_expense_receipts_changes();

-- RLS
ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on expense_receipts" ON expense_receipts FOR ALL USING (true) WITH CHECK (true);

-- 既存データマイグレーション
INSERT INTO expense_receipts (
  transaction_id, seq_no, drive_file_id, drive_url,
  generated_filename, original_filename, created_at, updated_at
)
SELECT
  t.id, 1,
  regexp_replace(t.memo, '.*file/d/([^/]+)(/.*)?', '\1'),
  t.memo,
  'legacy_' || t.id::text || '.bin',
  'legacy',
  t.created_at, t.created_at
FROM transactions t
WHERE t.source = 'receipt_ai'
  AND t.memo IS NOT NULL
  AND t.memo LIKE 'https://drive.google.com/file/d/%'
  AND NOT EXISTS (SELECT 1 FROM expense_receipts er WHERE er.transaction_id = t.id);
