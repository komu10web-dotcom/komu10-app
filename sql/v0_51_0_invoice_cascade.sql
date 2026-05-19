-- ============================================================
-- v0.51.0 (s101): 売上↔請求書のカスケード削除設定
-- ハンドオフs100§2.1 #6「売上消したのに請求書が残る」是正
-- ============================================================
--
-- 設計方針:
-- 1. 売上(transactions)削除 → 請求書(invoices.transaction_id) は SET NULL
--    (請求書は残し、紐付きのみ切断・履歴を保全)
-- 2. 請求書(invoices)削除 → 売上(transactions.invoice_id) は SET NULL
--    (売上は残し、紐付きのみ切断・status は accrued に戻す = 別途トリガで)
--
-- ON DELETE CASCADE ではなく ON DELETE SET NULL を選択した理由:
-- - 経理証跡の保全(片方を消しても他方の取引履歴は残す)
-- - ボス意図「ステータスを accrued に戻す」(ハンドオフ§2.3)と整合
--
-- 注意: invoices テーブル本体の DDL がリポ内 sql/ ディレクトリに存在しない
--      (Supabase 上で直接作成された経緯)。
--      本SQLでは「既存FKを DROP → SET NULL で再追加」のパターンで安全に変更。
-- ============================================================

BEGIN;

-- ============================================================
-- 1. transactions.invoice_id の FK 再設定
-- ============================================================
-- 既存制約を探索(命名規則は Supabase 自動命名: {table}_{column}_fkey)
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_invoice_id_fkey;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  ON DELETE SET NULL;

-- ============================================================
-- 2. invoices.transaction_id の FK 再設定
-- ============================================================
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_transaction_id_fkey;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  ON DELETE SET NULL;

-- ============================================================
-- 3. 請求書削除時に紐付き売上の status を accrued に戻すトリガ
-- ハンドオフ§2.3「請求書を消すと売上側 invoice_id=NULL + status='accrued' に戻す」
-- ============================================================
CREATE OR REPLACE FUNCTION on_invoice_delete_reset_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- 削除される請求書に紐付いていた transaction を accrued に戻す
  -- (FK SET NULL より先に発火するため、OLD.transaction_id で参照可能)
  IF OLD.transaction_id IS NOT NULL THEN
    UPDATE transactions
    SET status = 'accrued'
    WHERE id = OLD.transaction_id
      AND status IN ('billed', 'settled');
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_delete_reset_transaction ON invoices;
CREATE TRIGGER trg_invoice_delete_reset_transaction
BEFORE DELETE ON invoices
FOR EACH ROW
EXECUTE FUNCTION on_invoice_delete_reset_transaction();

-- ============================================================
-- 4. INVOICE_STATUS 3種化に伴う既存データ整合性チェック(参考SELECT)
-- ============================================================
-- 期待: draft, overdue が 0 件であること(本SQL実行前に手動確認推奨)
-- SELECT status, count(*) FROM invoices GROUP BY status;

COMMIT;

-- ============================================================
-- 検証手順(SQL Editor で実行後・別途確認):
-- ============================================================
-- (1) FK の ON DELETE 句確認
-- SELECT conname, confdeltype FROM pg_constraint
-- WHERE conname IN ('transactions_invoice_id_fkey', 'invoices_transaction_id_fkey');
-- → confdeltype = 'n' (SET NULL) が期待値
--
-- (2) トリガ存在確認
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_invoice_delete_reset_transaction';
--
-- (3) 動作確認: テスト用に1件作成 → 請求書削除 → 売上ステータスがaccruedに戻ること
-- ============================================================
