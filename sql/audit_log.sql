-- ============================================================
-- komu10 audit_log: 優良な電子帳簿保存 要件❶対応
-- 訂正・削除履歴の自動記録（PostgreSQLトリガー）
-- 
-- 対象テーブル: transactions（経費・売上）
-- 将来拡張: projects, equipment_items 等にも同じパターンで追加可能
-- 
-- 実行場所: Supabase SQL Editor
-- ============================================================

-- 1. audit_log テーブル作成
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- どのテーブルのどのレコードか
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- 何が起きたか
  operation TEXT NOT NULL CHECK (operation IN ('UPDATE', 'DELETE')),
  
  -- 変更前の全フィールド（JSON）
  old_data JSONB NOT NULL,
  
  -- 変更後の全フィールド（UPDATEのみ。DELETEはNULL）
  new_data JSONB,
  
  -- 変更されたフィールド名の一覧（差分検出用）
  changed_fields TEXT[],
  
  -- 誰がいつ変更したか
  changed_by TEXT,  -- owner（tomo/toshiki）。将来の認証連携用
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 業務処理期間経過後の入力か（電子帳簿保存法 要件）
  is_late_entry BOOLEAN DEFAULT false
);

-- インデックス
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX idx_audit_log_operation ON audit_log(operation);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read audit_log" ON audit_log FOR SELECT USING (true);
CREATE POLICY "Allow insert audit_log" ON audit_log FOR INSERT WITH CHECK (true);
-- ★ UPDATE/DELETE ポリシーは意図的に設定しない
-- audit_logは追記専用。改ざん防止のため、アプリからの更新・削除を禁止

-- 2. トリガー関数: transactions テーブル用
CREATE OR REPLACE FUNCTION audit_transactions_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_fields TEXT[] := '{}';
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  v_old_json := to_jsonb(OLD);
  
  IF TG_OP = 'UPDATE' THEN
    v_new_json := to_jsonb(NEW);
    
    -- 変更されたフィールドを検出（updated_atは除外）
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key
      FROM jsonb_each(v_old_json) AS o(key, value)
      FULL OUTER JOIN jsonb_each(v_new_json) AS n(key, value) USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND key NOT IN ('updated_at')
    ) diff;
    
    -- 実質的な変更がない場合はログしない（updated_atだけの変更等）
    IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    
    INSERT INTO audit_log (
      table_name, record_id, operation,
      old_data, new_data, changed_fields,
      changed_by
    ) VALUES (
      'transactions', OLD.id, 'UPDATE',
      v_old_json, v_new_json, v_changed_fields,
      NEW.owner  -- 変更後のownerを記録
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (
      table_name, record_id, operation,
      old_data, new_data, changed_fields,
      changed_by
    ) VALUES (
      'transactions', OLD.id, 'DELETE',
      v_old_json, NULL, NULL,
      OLD.owner
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. トリガーをtransactionsテーブルにアタッチ
CREATE TRIGGER trg_audit_transactions
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION audit_transactions_changes();

-- ============================================================
-- 検証用クエリ（実行不要。動作確認時に使用）
-- ============================================================

-- 特定レコードの変更履歴を時系列で確認:
-- SELECT operation, changed_fields, changed_at, old_data, new_data
-- FROM audit_log
-- WHERE table_name = 'transactions' AND record_id = 'xxx'
-- ORDER BY changed_at;

-- 削除された取引の一覧:
-- SELECT record_id, old_data->>'date' as tx_date, old_data->>'amount' as amount,
--        old_data->>'store' as store, changed_at as deleted_at
-- FROM audit_log
-- WHERE table_name = 'transactions' AND operation = 'DELETE'
-- ORDER BY changed_at DESC;
