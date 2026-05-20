-- ============================================================
-- v0.52.0 (s101): テストモード + 採番カウンタ
-- ============================================================
-- 設計:
-- 1. invoice_number_counters: 年度×モード別の永久連番カウンタ
-- 2. invoices.is_test / transactions.is_test: テストモード識別フラグ
-- 3. テストモード時は別カウンタ + フォルダ分離 + 集計除外
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 採番カウンタテーブル(本番/テスト分離)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  year integer NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, is_test)
);

COMMENT ON TABLE invoice_number_counters IS
  '請求書番号採番カウンタ(year×is_test別・永久連番保証)';

-- ============================================================
-- 2. is_test カラム追加
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 集計除外用インデックス(is_test=false が圧倒的多数の前提)
CREATE INDEX IF NOT EXISTS idx_invoices_is_test
  ON invoices(is_test) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_transactions_is_test
  ON transactions(is_test) WHERE is_test = true;

-- ============================================================
-- 3. 既存データの初期カウンタセット(本番)
-- INV-2026-0001 と 0002 が存在するため、本番カウンタ初期値=2
-- ============================================================
INSERT INTO invoice_number_counters (year, is_test, last_number)
SELECT 2026, false, 2
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_number_counters WHERE year = 2026 AND is_test = false
);

-- テスト用は0から
INSERT INTO invoice_number_counters (year, is_test, last_number)
SELECT 2026, true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_number_counters WHERE year = 2026 AND is_test = true
);

-- ============================================================
-- 4. 採番関数(原子的にカウンタ進める)
-- ============================================================
CREATE OR REPLACE FUNCTION next_invoice_number(
  p_year integer,
  p_is_test boolean
) RETURNS integer AS $$
DECLARE
  v_next integer;
BEGIN
  -- 行ロックして +1(複数同時発行でも重複しない)
  INSERT INTO invoice_number_counters (year, is_test, last_number)
  VALUES (p_year, p_is_test, 1)
  ON CONFLICT (year, is_test)
  DO UPDATE SET
    last_number = invoice_number_counters.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION next_invoice_number(integer, boolean) IS
  '請求書番号を原子的にインクリメント(削除しても番号再利用なし・永久連番保証)';

COMMIT;

-- ============================================================
-- 検証SQL(別タブで実行)
-- ============================================================
-- (1) カウンタ初期値確認
-- SELECT * FROM invoice_number_counters;
--
-- (2) is_test カラム存在確認
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('invoices','transactions') AND column_name = 'is_test';
--
-- (3) 採番関数動作確認(本番カウンタが3を返すはず)
-- SELECT next_invoice_number(2026, false);
-- 確認後元に戻す: UPDATE invoice_number_counters SET last_number=2 WHERE year=2026 AND is_test=false;
-- ============================================================
