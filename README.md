# komu10 会計・事業管理システム v0.3

観光・クリエイター事業向けの会計・事業管理システム。

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router)
- **スタイリング**: Tailwind CSS
- **データベース**: Supabase (PostgreSQL)
- **ホスティング**: Vercel

## セットアップ

### 1. 環境変数

`.env.local` ファイルを作成:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. 依存関係インストール

```bash
npm install
```

### 3. 開発サーバー起動

```bash
npm run dev
```

## 機能

- ダッシュボード（売上・経費・利益サマリー）
- 取引一覧・追加
- プロジェクト管理
- 仕訳帳
- 申告レポート（按分計算込み）
- 固定資産台帳（減価償却計算）
- 按分設定

## ユーザー

- トモ (tomo)
- トシキ (toshiki)

ヘッダーのセレクターで切り替え可能。
