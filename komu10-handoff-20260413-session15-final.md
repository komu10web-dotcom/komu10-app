# komu10 引き継ぎ（2026-04-13 セッション15 最終版）

## 本セッションで完了したこと

### 請求書管理機能 — 実装 Steps 1〜5 ✅

#### Step 1: 型定義更新（types/database.ts）
- `clients` テーブル型: 旧6カラム → 新13カラム（`client_number`, `short_name`, `postal_code`, `address`, `contact_name`, `contact_email`, `is_active` 追加。旧 `payment_terms_days`, `default_contact` 削除）
- `invoices` テーブル型: 旧設計（`client_name`直書き）→ 新設計（`client_id` FK、`period_start/end`、`bank_account_id`、`drive_folder_id/file_id`、`transaction_id` 等）
- `invoice_items` テーブル型: `created_at` 追加
- `INVOICE_STATUS` 定数追加（draft/issued/paid）
- `InvoiceWithItems`, `ClientWithInvoiceCount` ヘルパー型追加
- バージョンコメントを v0.4.0 に更新

#### Step 2: 設定ページ 取引先マスタCRUD（SettingsContent.tsx）
- `client_number` 自動採番（オーナー内最大+1、3桁ゼロ埋め）
- 一覧UI: 番号+名称+略称表示、停止中は半透明+「停止」バッジ
- ClientModal: 新フィールド対応（`short_name`, `postal_code`, `address`, `contact_name`, `contact_email`, `payment_terms`, `is_active`トグル）
- ソート: `client_number`順に統一（初期フェッチ・リフレッシュ両方）

#### Step 3: 入金ページ 請求書タブ（IncomeContent.tsx + InvoiceTab.tsx）
- IncomeContent.tsx にタブ切り替え追加（売上一覧 / 請求書）
- InvoiceTab.tsx 新規作成（3画面構成）:
  - **一覧**: ステータスフィルター（すべて/下書き/発行済/入金済）、テーブル、フッター集計、削除確認
  - **エディタ**: 取引先選択→前回請求書ベース自動入力、明細行追加/削除/編集、合計自動計算、`INV-{年度}-{4桁連番}`自動採番
  - **プレビュー**: 請求書フォーマット（宛名・番号・日付・請求元情報・明細テーブル・小計/税/合計・振込先・備考）

#### Step 4: PDF + Googleスプレッドシート出力 + Drive自動保存
- `/api/invoices/export` APIルート新規作成
  - Supabaseから請求書・明細・取引先・請求元・振込先を取得
  - GAS `?action=token` でOAuthトークン取得
  - Google Sheets API でスプレッドシート作成（テンプレート書き込み+書式設定）
  - スプレッドシートをPDFエクスポート
  - PDFをDriveにアップロード
  - Driveフォルダ構造: `03_請求書/{01_トモ or 02_トシキ}/{年度}/{取引先番号}_{取引先名}/`
  - invoicesテーブルの `drive_file_id`, `pdf_url` を自動更新
- プレビュー画面に「PDF & シート出力」ボタン追加
- 出力完了後にPDF/スプレッドシートのリンク表示

#### Step 5: 売上仕訳自動連携
- 発行済（issued）→ transactionsに売上レコード自動作成（status=`billed`、kamoku=`sales`）
- 入金済（paid）→ 紐付き仕訳を `settled` に更新、`actual_payment_date` 記録
- `transaction_id` で二重作成防止
- 既存仕訳がある場合は金額・日付を更新（再編集対応）

#### Step 6: スプレッドシート読み込み → スキップ（将来実装）

-----

## 未完了タスク

### Vercel環境変数（PCから設定が必要）
| 変数名 | 値 | 説明 |
|---|---|---|
| `INVOICE_DRIVE_FOLDER_ID` | `1vRtwWNIGVJd9uIFF3d-au-wZsTFQeCkx` | 03_請求書フォルダID |

設定場所: Vercelダッシュボード > komu10-app > Settings > Environment Variables

### 動作検証（環境変数設定後）
1. 設定ページで取引先を登録
2. 売上ページ→請求書タブで請求書を新規作成
3. プレビューで表示確認
4. 「PDF & シート出力」ボタンで出力確認
5. Driveに正しいフォルダ構造で保存されているか確認
6. ステータスをissuedに→売上一覧にtransactionが作成されるか確認
7. ステータスをpaidに→transactionがsettledになるか確認

-----

## DB・インフラ完了状況

| テーブル/インフラ | 状態 |
|---|---|
| equipment_items | ✅ |
| sync_sources | ✅ |
| personal_deductions | ✅ |
| fund_transfers (audit_log付) | ✅ |
| expense_templates | ✅ |
| clients（再作成） | ✅ |
| invoices（再作成） | ✅ |
| invoice_items（再作成） | ✅ |
| transactions: payment_method + bank_account_id | ✅ |
| profiles: business_name/postal_code/address/phone/email | ✅ |
| Storageバケット: equipment-photos / deduction-photos | ✅ |
| Vercel環境変数 SUPABASE_SERVICE_ROLE_KEY | ✅ |
| Vercel環境変数 INVOICE_DRIVE_FOLDER_ID | ⬜ 未設定 |

-----

## 現在のファイル行数

| ファイル | 行数 |
|---|---|
| TransactionModal.tsx | 749行 |
| SettingsContent.tsx | ~3,810行 |
| ManagementContent.tsx | 1,674行 |
| TaxReturnContent.tsx | 765行 |
| IncomeContent.tsx | ~865行 |
| InvoiceTab.tsx | ~940行 |
| types/database.ts | ~574行 |
| api/invoices/export/route.ts | ~300行 |

-----

## 技術情報

### GitHub push
```bash
git push https://komu10web-dotcom:[TOKEN]@github.com/komu10web-dotcom/komu10-app.git main
```
※ トークンはメモリ参照

### Supabase
- API ref: `pjixnclwywikewcyloeq`
- Dashboard ID: `uuenrrfjkcubxqdtlsgy`
- SQL Editor: https://supabase.com/dashboard/project/uuenrrfjkcubxqdtlsgy/sql/new

### アプリ
- URL: https://komu10-kaikei.vercel.app
- GitHub: https://github.com/komu10web-dotcom/komu10-app
- 現在バージョン: **v0.4.0**

-----

## 次セッションの候補タスク

1. **動作検証** — 環境変数設定後の請求書一連フロー検証
2. **UIフィードバック反映** — 明細行の品名列幅拡大、数量列縮小、千円区切りカンマ表示
3. **設定ページ背景色検証**（Session 5持ち越し）
4. **固定資産台帳UI実装**
5. **Phase 4b: 銀行勘定調整**

-----

## 絶対ルール

1. 実装前にボスの承認を必ず取ること
2. push前に検証: 設計書整合/ハードコード/引数/DBフィルター/ロジックバグ
3. 1ファイルずつ小分けに実装
4. SQL実行依頼時は ①SQL Editor直リンク ②コピペ可能SQL ③確認方法を明記
5. DB確認作業をボスに依頼するな（handoff/メモリから把握）
6. 請求書番号は `INV-{年度}-{4桁連番}` で全体通し番号
7. 取引先番号はオーナーごとに独立採番、3桁ゼロ埋め
8. Driveフォルダ: `03_請求書/{01_トモ or 02_トシキ}/{年度}/{取引先番号}_{取引先名}/`
9. 請求書出力はPDF + Googleスプレッドシートの2形式。Excelは不要
10. 免税事業者の消費税欄は「—」表示。tax_amount=0で保存
11. 発行済み請求書も再編集・修正可能（ステータスは逆行しない）
