-- ============================================================
-- komu10 v0.30.0: 所得控除タブ Phase 2
-- 社保・小規模企業共済等・医療費控除(セルメデ含む)の入力UI
-- 実行場所: Supabase SQL Editor
-- 前提: audit_log.sql 実行済
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- ① tax_deductions: 年×ユーザー×項目別の所得控除サマリ
-- ─────────────────────────────────────────────────────────
CREATE TABLE tax_deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner TEXT NOT NULL,                  -- 'tomo' | 'toshiki'
  year INTEGER NOT NULL,                -- 申告年(2026 = 令和8年分)
  deduction_key TEXT NOT NULL,          -- INCOME_DEDUCTION_ITEMS.key と一致
                                        -- social_insurance / small_enterprise_kyosai
                                        -- small_enterprise_ideco / small_enterprise_kokumin_kikin
                                        -- medical_notification / medical_reimbursement
                                        -- medical_method / selfmed_qualified
                                        -- selfmed_qualification_note 等
  amount NUMERIC(12, 0),                -- 金額(円・整数)。null許容(フラグ系・テキスト系のため)
  text_value TEXT,                      -- テキスト値(セルメデ要件メモ等)
  bool_value BOOLEAN,                   -- 真偽値(セルメデ要件充足等)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner, year, deduction_key)
);

CREATE INDEX idx_tax_deductions_owner_year ON tax_deductions(owner, year);
CREATE INDEX idx_tax_deductions_key ON tax_deductions(deduction_key);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION update_tax_deductions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tax_deductions_updated_at
  BEFORE UPDATE ON tax_deductions
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_deductions_updated_at();

-- 監査ログ
CREATE OR REPLACE FUNCTION audit_tax_deductions_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_fields TEXT[] := '{}';
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN v_changed_fields := array_append(v_changed_fields, 'amount'); END IF;
    IF NEW.text_value IS DISTINCT FROM OLD.text_value THEN v_changed_fields := array_append(v_changed_fields, 'text_value'); END IF;
    IF NEW.bool_value IS DISTINCT FROM OLD.bool_value THEN v_changed_fields := array_append(v_changed_fields, 'bool_value'); END IF;
    IF array_length(v_changed_fields, 1) > 0 THEN
      INSERT INTO audit_log(table_name, record_id, operation, old_data, new_data, changed_fields, owner)
      VALUES('tax_deductions', NEW.id, 'UPDATE', v_old_json, v_new_json, v_changed_fields, NEW.owner);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(OLD);
    INSERT INTO audit_log(table_name, record_id, operation, old_data, new_data, changed_fields, owner)
    VALUES('tax_deductions', OLD.id, 'DELETE', v_old_json, NULL, NULL, OLD.owner);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tax_deductions_audit
  AFTER UPDATE OR DELETE ON tax_deductions
  FOR EACH ROW
  EXECUTE FUNCTION audit_tax_deductions_changes();

-- ─────────────────────────────────────────────────────────
-- ② medical_expense_details: 医療費控除の追加明細
-- ─────────────────────────────────────────────────────────
CREATE TABLE medical_expense_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner TEXT NOT NULL,                  -- 'tomo' | 'toshiki'
  year INTEGER NOT NULL,                -- 申告年
  expense_date DATE NOT NULL,           -- 支払日
  patient_type TEXT NOT NULL CHECK (patient_type IN ('self', 'family', 'other')),
                                        -- self=自分 / family=家族(生計を一にする) / other=その他
  patient_name TEXT,                    -- 受診者氏名(任意)
  category TEXT NOT NULL CHECK (category IN ('otc', 'transport', 'dental', 'care', 'other')),
                                        -- otc=市販薬 / transport=通院交通費 / dental=歯科自由診療
                                        -- care=介護サービス / other=その他
  vendor TEXT,                          -- 支払先(薬局名・病院名)
  amount NUMERIC(12, 0) NOT NULL,       -- 支払金額(円)
  reimbursement NUMERIC(12, 0) NOT NULL DEFAULT 0,  -- この明細への補填額
  is_selfmed BOOLEAN NOT NULL DEFAULT FALSE,        -- セルフメディケーション税制対象薬か
  note TEXT,                            -- メモ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medical_details_owner_year ON medical_expense_details(owner, year);
CREATE INDEX idx_medical_details_date ON medical_expense_details(expense_date DESC);
CREATE INDEX idx_medical_details_selfmed ON medical_expense_details(is_selfmed) WHERE is_selfmed = TRUE;

CREATE OR REPLACE FUNCTION update_medical_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_medical_details_updated_at
  BEFORE UPDATE ON medical_expense_details
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_details_updated_at();

-- 監査ログ
CREATE OR REPLACE FUNCTION audit_medical_details_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_fields TEXT[] := '{}';
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
    IF NEW.expense_date IS DISTINCT FROM OLD.expense_date THEN v_changed_fields := array_append(v_changed_fields, 'expense_date'); END IF;
    IF NEW.patient_type IS DISTINCT FROM OLD.patient_type THEN v_changed_fields := array_append(v_changed_fields, 'patient_type'); END IF;
    IF NEW.patient_name IS DISTINCT FROM OLD.patient_name THEN v_changed_fields := array_append(v_changed_fields, 'patient_name'); END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN v_changed_fields := array_append(v_changed_fields, 'category'); END IF;
    IF NEW.vendor IS DISTINCT FROM OLD.vendor THEN v_changed_fields := array_append(v_changed_fields, 'vendor'); END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN v_changed_fields := array_append(v_changed_fields, 'amount'); END IF;
    IF NEW.reimbursement IS DISTINCT FROM OLD.reimbursement THEN v_changed_fields := array_append(v_changed_fields, 'reimbursement'); END IF;
    IF NEW.is_selfmed IS DISTINCT FROM OLD.is_selfmed THEN v_changed_fields := array_append(v_changed_fields, 'is_selfmed'); END IF;
    IF NEW.note IS DISTINCT FROM OLD.note THEN v_changed_fields := array_append(v_changed_fields, 'note'); END IF;
    IF array_length(v_changed_fields, 1) > 0 THEN
      INSERT INTO audit_log(table_name, record_id, operation, old_data, new_data, changed_fields, owner)
      VALUES('medical_expense_details', NEW.id, 'UPDATE', v_old_json, v_new_json, v_changed_fields, NEW.owner);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(OLD);
    INSERT INTO audit_log(table_name, record_id, operation, old_data, new_data, changed_fields, owner)
    VALUES('medical_expense_details', OLD.id, 'DELETE', v_old_json, NULL, NULL, OLD.owner);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_medical_details_audit
  AFTER UPDATE OR DELETE ON medical_expense_details
  FOR EACH ROW
  EXECUTE FUNCTION audit_medical_details_changes();

-- ─────────────────────────────────────────────────────────
-- 動作確認(実行後にこれを走らせて空テーブルが出ればOK)
-- ─────────────────────────────────────────────────────────
-- SELECT * FROM tax_deductions LIMIT 1;
-- SELECT * FROM medical_expense_details LIMIT 1;
