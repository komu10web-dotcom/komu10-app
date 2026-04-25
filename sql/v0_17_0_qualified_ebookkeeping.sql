-- ============================================================
-- komu10 v0.17.0: 優良な電子帳簿対応 + 事業者ステータス管理
-- 
-- 内容:
--   ① audit_log を主要テーブルに展開（UPDATE/DELETE 記録）
--      対象: invoices, invoice_items, expense_receipts,
--            anbun_settings, assets, projects, clients,
--            recurring_expenses, transaction_allocations
--      ※transactions は v0.10.0 で対応済（重複作成しない）
--      ※sub_categories はアプリ側ハンドリング済（v0.16.1）
--   ② profiles に事業者ステータス3カラム追加
--      invoice_registered / invoice_number / is_taxable
--
-- 実行場所: Supabase SQL Editor
-- 実行時間: 約 5〜10 秒
-- 影響範囲: 既存データへの破壊変更なし。
--           トリガーは UPDATE/DELETE 時に追記のみで実行コストは無視できる程度。
-- ============================================================

-- ============================================================
-- ① 汎用トリガー関数（全テーブル共用）
-- ============================================================
-- 既存の audit_transactions_changes() は transactions 専用なので、
-- 他テーブル用に汎用関数を新設する。

CREATE OR REPLACE FUNCTION audit_generic_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_fields TEXT[] := '{}';
  v_old_json JSONB;
  v_new_json JSONB;
  v_owner TEXT;
BEGIN
  v_old_json := to_jsonb(OLD);
  
  -- owner カラムが存在するテーブルでは値を取得、存在しなければNULL
  -- TG_TABLE_NAME と JSONB から動的に取得
  IF v_old_json ? 'owner' THEN
    IF TG_OP = 'UPDATE' THEN
      v_owner := to_jsonb(NEW)->>'owner';
    ELSE
      v_owner := v_old_json->>'owner';
    END IF;
  ELSE
    v_owner := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_new_json := to_jsonb(NEW);
    
    -- 変更されたフィールドを検出（updated_at は除外）
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key
      FROM jsonb_each(v_old_json) AS o(key, value)
      FULL OUTER JOIN jsonb_each(v_new_json) AS n(key, value) USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND key NOT IN ('updated_at')
    ) diff;
    
    -- updated_at だけの変更は記録しない
    IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    
    INSERT INTO audit_log (
      table_name, record_id, operation,
      old_data, new_data, changed_fields,
      changed_by
    ) VALUES (
      TG_TABLE_NAME, OLD.id, 'UPDATE',
      v_old_json, v_new_json, v_changed_fields,
      v_owner
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (
      table_name, record_id, operation,
      old_data, new_data, changed_fields,
      changed_by
    ) VALUES (
      TG_TABLE_NAME, OLD.id, 'DELETE',
      v_old_json, NULL, NULL,
      v_owner
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ② 各テーブルにトリガーをアタッチ
-- ============================================================
-- すでにトリガーが存在する場合は DROP してから作り直す（冪等性確保）

-- invoices
DROP TRIGGER IF EXISTS trg_audit_invoices ON invoices;
CREATE TRIGGER trg_audit_invoices
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- invoice_items
DROP TRIGGER IF EXISTS trg_audit_invoice_items ON invoice_items;
CREATE TRIGGER trg_audit_invoice_items
  BEFORE UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- expense_receipts
DROP TRIGGER IF EXISTS trg_audit_expense_receipts ON expense_receipts;
CREATE TRIGGER trg_audit_expense_receipts
  BEFORE UPDATE OR DELETE ON expense_receipts
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- anbun_settings
DROP TRIGGER IF EXISTS trg_audit_anbun_settings ON anbun_settings;
CREATE TRIGGER trg_audit_anbun_settings
  BEFORE UPDATE OR DELETE ON anbun_settings
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- assets（固定資産）
DROP TRIGGER IF EXISTS trg_audit_assets ON assets;
CREATE TRIGGER trg_audit_assets
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- projects
DROP TRIGGER IF EXISTS trg_audit_projects ON projects;
CREATE TRIGGER trg_audit_projects
  BEFORE UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- clients
DROP TRIGGER IF EXISTS trg_audit_clients ON clients;
CREATE TRIGGER trg_audit_clients
  BEFORE UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- recurring_expenses
DROP TRIGGER IF EXISTS trg_audit_recurring_expenses ON recurring_expenses;
CREATE TRIGGER trg_audit_recurring_expenses
  BEFORE UPDATE OR DELETE ON recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- transaction_allocations（按分明細）
DROP TRIGGER IF EXISTS trg_audit_transaction_allocations ON transaction_allocations;
CREATE TRIGGER trg_audit_transaction_allocations
  BEFORE UPDATE OR DELETE ON transaction_allocations
  FOR EACH ROW EXECUTE FUNCTION audit_generic_changes();

-- ============================================================
-- ③ profiles に事業者ステータス3カラム追加
-- ============================================================
-- invoice_registered: インボイス登録の有無
-- invoice_number:     登録番号（T+13桁）。未登録なら NULL
-- is_taxable:         課税事業者フラグ。インボイス登録済なら自動でtrue扱い

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invoice_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.invoice_registered IS 'インボイス（適格請求書発行事業者）の登録有無';
COMMENT ON COLUMN profiles.invoice_number     IS '登録番号（T+13桁）。未登録ならNULL';
COMMENT ON COLUMN profiles.is_taxable         IS '課税事業者フラグ。インボイス登録済なら自動true扱い';

-- ============================================================
-- ④ 検証用クエリ（実行不要。確認時に使用）
-- ============================================================

-- A. トリガー設置確認:
-- SELECT trigger_name, event_object_table
-- FROM information_schema.triggers
-- WHERE trigger_name LIKE 'trg_audit_%'
-- ORDER BY event_object_table;
-- 期待: 10件（transactions + 9テーブル）

-- B. profiles 新カラム確認:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'profiles' 
--   AND column_name IN ('invoice_registered', 'invoice_number', 'is_taxable');

-- C. 動作テスト（任意のテーブルで UPDATE → audit_log に記録されるか）:
-- UPDATE projects SET name = name WHERE id = '<任意のID>';
-- → updated_at だけの変更なら記録されない（仕様）
-- 
-- UPDATE projects SET name = '_test' WHERE id = '<任意のID>';
-- SELECT * FROM audit_log WHERE table_name = 'projects' ORDER BY changed_at DESC LIMIT 1;
-- → 記録されているはず
