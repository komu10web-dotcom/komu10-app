-- ============================================================
-- komu10 v0.10.0: AI会計相談機能
-- accounting_consultations テーブル新設
-- 
-- 設計方針:
-- - 経費入力中（transaction_id NULL）or 既存経費（transaction_id あり）両対応
-- - context_snapshot: 相談時点の対象経費データ（JSONB保存）
-- - messages: ユーザー/AI の対話ログ（JSONB配列）
-- - resolution: 相談結果の分類
-- 
-- 実行場所: Supabase SQL Editor
-- ============================================================

-- 1. accounting_consultations テーブル作成
CREATE TABLE accounting_consultations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 誰の相談か
  owner TEXT NOT NULL CHECK (owner IN ('tomo', 'toshiki')),
  
  -- 既存経費に紐づく場合（NULL = 入力中の新規経費に対する相談）
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  
  -- 相談時の文脈スナップショット（入力中フィールド or 対象経費の状態）
  -- 例: {"date": "2026-04-15", "amount": 3500, "store": "スターバックス渋谷店", "kamoku": "torizai", "item_name": "打合せ"}
  context_snapshot JSONB NOT NULL,
  
  -- 過去の類似取引情報（AIに渡した文脈）
  -- 例: {"similar_by_store": [...], "similar_by_kamoku": [...]}
  similar_context JSONB,
  
  -- 対話メッセージ配列
  -- 例: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- 相談結果の分類
  -- kamoku_changed: 科目を変更して確定
  -- split_changed: 按分を変更して確定
  -- info_only: 情報提供のみ（変更なし）
  -- abandoned: ユーザーが閉じた（未確定）
  resolution TEXT CHECK (resolution IN ('kamoku_changed', 'split_changed', 'info_only', 'abandoned')),
  
  -- 結果として変更された科目（resolution = 'kamoku_changed' の場合）
  resolved_kamoku TEXT,
  
  -- AIモデルバージョン（再現性のため）
  ai_model TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. インデックス
CREATE INDEX idx_consultations_owner ON accounting_consultations(owner);
CREATE INDEX idx_consultations_transaction_id ON accounting_consultations(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_consultations_created_at ON accounting_consultations(created_at DESC);

-- 3. updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_consultations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consultations_updated_at
  BEFORE UPDATE ON accounting_consultations
  FOR EACH ROW
  EXECUTE FUNCTION update_consultations_updated_at();

-- 4. RLS（既存テーブルに合わせて許可ポリシー）
ALTER TABLE accounting_consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on consultations" ON accounting_consultations FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 検証用クエリ（実行不要）
-- ============================================================

-- 特定経費の相談履歴を時系列で確認:
-- SELECT id, created_at, resolution, resolved_kamoku,
--        jsonb_array_length(messages) as msg_count
-- FROM accounting_consultations
-- WHERE transaction_id = 'xxx'
-- ORDER BY created_at DESC;

-- オーナー別の相談頻度:
-- SELECT owner, COUNT(*), 
--        COUNT(*) FILTER (WHERE resolution = 'kamoku_changed') as changes,
--        COUNT(*) FILTER (WHERE resolution = 'abandoned') as abandoned
-- FROM accounting_consultations
-- GROUP BY owner;
