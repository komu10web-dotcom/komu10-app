-- ============================================================
-- komu10 v0.12.0 既存領収書ファイル一括リネーム機能
-- ============================================================
-- 目的:
--   Sprint 3 として、legacy_*.bin 等の旧命名ファイルを
--   v0.11.0 命名規則に統一する機能を提供する。
--   復元可能性を担保するため旧ファイル名をDBに記録する。
-- ============================================================

-- ① expense_receipts に old_filename カラム追加（復元用）
ALTER TABLE expense_receipts
  ADD COLUMN IF NOT EXISTS old_filename text;

COMMENT ON COLUMN expense_receipts.old_filename IS
  'v0.12.0 リネーム機能: リネーム前のDriveファイル名（復元用）。NULLの場合は未リネーム';

-- ② リネーム履歴用インデックス（管理画面表示高速化）
CREATE INDEX IF NOT EXISTS idx_expense_receipts_old_filename
  ON expense_receipts(old_filename)
  WHERE old_filename IS NOT NULL;

-- ============================================================
-- 適用確認クエリ（ボス実行用）
-- ============================================================
-- SELECT
--   COUNT(*) FILTER (WHERE old_filename IS NULL) AS not_renamed,
--   COUNT(*) FILTER (WHERE old_filename IS NOT NULL) AS already_renamed,
--   COUNT(*) AS total
-- FROM expense_receipts;
