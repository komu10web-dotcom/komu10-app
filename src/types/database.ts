// komu10 会計システム v0.3
// Supabase Database 型定義（DB実態に完全一致）
// 2026-02-16 Phase 1 Step 1

export interface Database {
  public: {
    Tables: {
      // ユーザー情報
      profiles: {
        Row: {
          id: string;
          user_key: string; // 'tomo' | 'toshiki'
          display_name: string; // 'トモ' | 'トシキ'
          theme: string; // 'light' | 'warm' | 'cool'
          gas_api_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };

      // 取引データ（売上・経費）
      transactions: {
        Row: {
          id: string;
          tx_type: 'expense' | 'revenue';
          date: string; // YYYY-MM-DD
          amount: number; // 税込金額（円）
          kamoku: string; // 勘定科目ID
          division: string; // 部門ID
          owner: string; // 'tomo' | 'toshiki'
          store: string | null; // 取引先・店名
          description: string | null; // 内容・摘要
          memo: string | null; // メモ
          project_id: string | null; // プロジェクト紐付け
          tags: string[] | null; // タグ配列
          revenue_type: string | null; // 収益タイプID（売上時）
          source: string; // 'manual' | 'receipt_ai' | 'csv' | 'google_sheets'
          ai_confidence: number | null; // AI推定確信度 0-1
          confirmed: boolean; // AI入力の確認済み
          external_id: string | null; // 外部システム連携ID
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };

      // プロジェクト（案件・YouTube企画等）
      projects: {
        Row: {
          id: string;
          name: string; // プロジェクト名
          division: string; // 部門ID
          owner: string; // 担当者
          status: string; // 'ordered' | 'active' | 'completed'
          client: string | null; // クライアント名
          youtube_id: string | null; // YouTube動画ID
          category: string | null; // カテゴリ（種別）
          location: string | null; // ロケ地
          shoot_date: string | null; // 撮影日
          publish_date: string | null; // 公開日
          budget: number | null; // 予算
          target_revenue: number | null; // 目標売上
          note: string | null; // 備考
          tags: string[] | null; // タグ配列
          external_id: string | null; // 外部システム連携ID
          seq_no: number | null; // 通し番号（PJ-001のような全体通し番号用）
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };

      // 固定資産台帳
      assets: {
        Row: {
          id: string;
          name: string; // 資産名
          category: string; // カテゴリ（車両、機械装置等）
          owner: string; // 所有者
          acquisition_date: string; // 取得日
          acquisition_cost: number; // 取得価額
          useful_life: number; // 耐用年数
          business_use_ratio: number; // 事業使用割合（0-100）
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['assets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['assets']['Insert']>;
      };

      // 按分設定
      anbun_settings: {
        Row: {
          id: string;
          kamoku: string; // 勘定科目ID
          owner: string; // 担当者
          ratio: number; // 按分率（0-100）
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['anbun_settings']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['anbun_settings']['Insert']>;
      };
    };
  };
}

// エクスポート用の型エイリアス
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type Asset = Database['public']['Tables']['assets']['Row'];
export type AnbunSetting = Database['public']['Tables']['anbun_settings']['Row'];

// 部門定義（定数）
export const DIVISIONS = {
  data: { name: '観光データサイエンス', label: 'DATA', color: '#D4A03A', prefix: 'DT' },
  business: { name: '観光事業設計・実装', label: 'BIZ', color: '#1E3A5F', prefix: 'BZ' },
  editorial: { name: '編集・体験設計', label: 'EDIT', color: '#81D8D0', prefix: 'ED' },
  thisplace: { name: 'THIS PLACE', label: 'TP', color: '#FF5F45', prefix: 'TP' },
  youtube: { name: 'YouTube', label: 'YT', color: '#C23728', prefix: 'YT' },
  general: { name: '共通（按分対象）', label: 'GEN', color: '#C4B49A', prefix: 'GEN' },
} as const;

// 勘定科目定義（定数）
export const KAMOKU = {
  // 収益
  sales: { name: '売上高', type: 'revenue' },
  
  // 経費
  travel: { name: '旅費交通費', type: 'expense', anbun: false },
  equipment: { name: '消耗品費', type: 'expense', anbun: false },
  communication: { name: '通信費', type: 'expense', anbun: true },
  entertainment: { name: '接待交際費', type: 'expense', anbun: false },
  supplies: { name: '事務用品費', type: 'expense', anbun: false },
  outsource: { name: '外注費', type: 'expense', anbun: false },
  advertising: { name: '広告宣伝費', type: 'expense', anbun: false },
  rent: { name: '地代家賃', type: 'expense', anbun: true },
  utility: { name: '水道光熱費', type: 'expense', anbun: true },
  insurance: { name: '保険料', type: 'expense', anbun: false },
  depreciation: { name: '減価償却費', type: 'expense', anbun: false },
  vehicle: { name: '車両費', type: 'expense', anbun: true },
  tax: { name: '租税公課', type: 'expense', anbun: false },
  subscription: { name: 'サブスクリプション', type: 'expense', anbun: true },
  software: { name: 'ソフトウェア', type: 'expense', anbun: true },
  repair: { name: '修繕費', type: 'expense', anbun: false },
  misc: { name: '雑費', type: 'expense', anbun: false },
} as const;

// 収益タイプ定義
export const REVENUE_TYPES = {
  consulting: 'コンサルティング報酬',
  production: '制作費',
  ad_revenue: '広告収益（YouTube）',
  affiliate: 'アフィリエイト',
  tieup: 'タイアップ',
  license: 'ライセンス（写真等）',
  other: 'その他',
} as const;

// ステータス定義
export const PROJECT_STATUS = {
  ordered: '受注',
  active: '進行中',
  completed: '完了',
} as const;
