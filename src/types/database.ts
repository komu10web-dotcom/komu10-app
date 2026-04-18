// komu10 会計システム v0.5.3
// Supabase Database 型定義（DB実態に完全一致）
// 2026-04-15 invoices: subject/due_date/payment_terms追加、period_start/end削除
// 2026-04-15 invoice_items: unit追加
// 2026-04-18 business_domains新設 / transactions.business_domain / projects.business_domain 追加
// 2026-04-18 contract_types を6区分に再定義（請負/準委任/スポット/継続課金/権利収入/その他）

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
          fiscal_start_month: number; // 決算期開始月（1=1月, 4=4月等）デフォルト1
          owner_color: string | null; // 背景色（個人設定）
          business_name: string | null; // 屋号
          postal_code: string | null; // 郵便番号
          address: string | null; // 住所
          phone: string | null; // 電話番号
          email: string | null; // メールアドレス
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
          contract_type_id: string | null; // 契約区分ID（売上時）
          business_domain: string | null; // 事業領域ID（売上時必須 / 経費時null可）FK→business_domains.id
          source: string; // 'manual' | 'receipt_ai' | 'csv' | 'google_sheets'
          ai_confidence: number | null; // AI推定確信度 0-1
          confirmed: boolean; // AI入力の確認済み
          external_id: string | null; // 外部システム連携ID
          status: string; // 'forecast' | 'accrued' | 'billed' | 'settled'
          accrual_date: string | null; // PL計上月（納品予定日）
          expected_payment_date: string | null; // CF計上予定日
          actual_payment_date: string | null; // 実際の入出金日
          client_id: string | null; // 取引先マスタID
          payment_method: string | null; // 'personal' | 'bank_account'
          bank_account_id: string | null; // bank_accountsテーブルのUUID
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
          business_domain: string | null; // 事業領域ID（将来拡張用）FK→business_domains.id
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

      // 交通費詳細
      transport_details: {
        Row: {
          id: string;
          transaction_id: string;
          purpose: string;
          route_legs: any[];
          class: string | null;
          class_reason: string | null;
          round_trip: string;
          companion: string | null;
          flight_train_no: string | null;
          route_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transport_details']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['transport_details']['Insert']>;
      };

      // 交通費目的マスタ
      transport_purposes: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transport_purposes']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['transport_purposes']['Insert']>;
      };

      // 銀行口座
      bank_accounts: {
        Row: {
          id: string;
          name: string; // 通称（メイン口座等）
          bank_name: string; // 銀行名
          bank_code: string | null; // 金融機関コード
          branch_name: string | null; // 支店名
          branch_code: string | null; // 支店コード
          account_type: string; // 普通・当座等
          account_number: string | null; // 口座番号（フル）
          account_number_last4: string | null; // 口座番号下4桁（一覧表示用）
          account_holder_name: string | null; // 口座名義（漢字）
          account_holder_kana: string | null; // 口座名義（カナ）
          owner: string;
          balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bank_accounts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['bank_accounts']['Insert']>;
      };

      // 入出金明細
      bank_transactions: {
        Row: {
          id: string;
          bank_account_id: string;
          date: string;
          amount: number;
          description: string | null;
          match_status: string;
          matched_transaction_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bank_transactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['bank_transactions']['Insert']>;
      };

      // 請求書
      invoices: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          client_id: string; // FK→clients
          invoice_number: string; // INV-YYYY-NNNN（全体通し）
          issue_date: string; // 発行日
          due_date: string | null; // 支払期限
          subject: string | null; // 件名
          payment_terms: string | null; // 支払条件
          subtotal: number; // 小計（税抜）
          tax_amount: number; // 消費税額（免税=0）
          total: number; // 合計
          status: string; // 'draft' | 'issued' | 'paid'
          bank_account_id: string | null; // FK→bank_accounts（振込先）
          notes: string | null; // 備考
          drive_folder_id: string | null; // Google DriveフォルダID
          drive_file_id: string | null; // Google DriveファイルID
          pdf_url: string | null; // PDF URL
          issued_at: string | null; // 発行日時
          paid_at: string | null; // 入金確認日時
          transaction_id: string | null; // FK→transactions（売上仕訳連携）
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };

      // 請求書明細
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string; // FK→invoices (CASCADE)
          sort_order: number;
          description: string; // 品名・内容
          quantity: number;
          unit: string | null; // 単位（式・月・時間等）デフォルト「式」
          unit_price: number;
          amount: number; // quantity × unit_price
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoice_items']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['invoice_items']['Insert']>;
      };

      // 収益タイプマスタ
      revenue_types: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['revenue_types']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['revenue_types']['Insert']>;
      };

      // 収益タイプ×事業 中間テーブル
      revenue_type_divisions: {
        Row: {
          id: string;
          revenue_type_id: string;
          division: string;
        };
        Insert: Omit<Database['public']['Tables']['revenue_type_divisions']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['revenue_type_divisions']['Insert']>;
      };

      // 契約区分マスタ
      contract_types: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['contract_types']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['contract_types']['Insert']>;
      };

      // 事業領域マスタ（2026-04-18追加）
      // ブランディング・経営マーケ・自主事業の3区分（軸B）
      business_domains: {
        Row: {
          id: string; // 'branding' | 'consulting' | 'own_business' 等
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['business_domains']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['business_domains']['Insert']>;
      };

      // 取引先マスタ
      clients: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          client_number: string; // オーナー内連番（001, 002…）
          name: string; // 取引先名（KKDAY JAPAN等）
          short_name: string | null; // 略称
          postal_code: string | null; // 郵便番号
          address: string | null; // 住所
          contact_name: string | null; // 担当者名
          contact_email: string | null; // 担当者メール
          payment_terms: string | null; // 支払条件（月末締翌月末 等）
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['clients']['Insert']>;
      };

      // 固定経費テンプレート
      recurring_expenses: {
        Row: {
          id: string;
          owner: string;
          description: string;
          amount: number;
          kamoku: string;
          division: string;
          frequency: 'monthly' | 'quarterly' | 'annual';
          start_date: string;
          end_date: string | null;
          payment_day: number | null;
          client_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recurring_expenses']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['recurring_expenses']['Insert']>;
      };

      // 備品台帳
      equipment_items: {
        Row: {
          id: string;
          transaction_id: string | null;
          name: string;
          category: string | null;
          maker: string | null;
          serial: string | null;
          business_ratio: number;
          warranty_date: string | null;
          photos: string[];
          note: string | null;
          status: string; // 'active' | 'disposed' | 'transferred'
          owner: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['equipment_items']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['equipment_items']['Insert']>;
      };

      // 取引按分（1取引→複数事業・PJに比率配分）
      transaction_allocations: {
        Row: {
          id: string;
          transaction_id: string;
          division_id: string;       // 事業ID
          project_id: string | null; // PJ ID（任意）
          percent: number;           // 比率 1-100
          amount: number;            // 按分後金額
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transaction_allocations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['transaction_allocations']['Insert']>;
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
export type TransportDetail = Database['public']['Tables']['transport_details']['Row'];
export type BankAccount = Database['public']['Tables']['bank_accounts']['Row'];
export type BankTransaction = Database['public']['Tables']['bank_transactions']['Row'];

// bank_balances（月次残高スナップショット）
export type BankBalance = {
  id: string;
  account_id: string;
  month: string;
  balance: number;
  recorded_at: string;
};
export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type InvoiceItem = Database['public']['Tables']['invoice_items']['Row'];
export type RevenueType = Database['public']['Tables']['revenue_types']['Row'];
export type RevenueTypeDivision = Database['public']['Tables']['revenue_type_divisions']['Row'];
export type ContractType = Database['public']['Tables']['contract_types']['Row'];
export type BusinessDomain = Database['public']['Tables']['business_domains']['Row'];
export type TransactionAllocation = Database['public']['Tables']['transaction_allocations']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type RecurringExpense = Database['public']['Tables']['recurring_expenses']['Row'];
export type EquipmentItem = Database['public']['Tables']['equipment_items']['Row'];

// audit_log（訂正・削除履歴 — 優良な電子帳簿保存 要件❶）
export type AuditLog = {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  changed_by: string | null;
  changed_at: string;
  is_late_entry: boolean;
};

// sync_sources（DBテーブルだがDatabaseインターフェース外で定義）
export type SyncSource = {
  id: string;
  name: string;
  source_type: string;
  sheet_id: string | null;
  sheet_tab: string | null;
  gas_url: string | null;
  target_table: string;
  column_mapping: Record<string, string>;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// 資金移動
export type FundTransfer = {
  id: string;
  owner: string;
  transfer_type: 'owner_deposit' | 'owner_withdrawal' | 'internal_transfer';
  from_description: string;
  to_description: string;
  from_bank_account_id: string | null;
  to_bank_account_id: string | null;
  amount: number;
  transfer_fee: number;
  transfer_date: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

// 交通費・汎用経費テンプレート
export type RouteLeg = {
  from: string;
  to: string;
  method: string;
  amount: number;
  green_available?: boolean;
  green_surcharge?: number;
};

export type ExpenseTemplate = {
  id: string;
  owner: string;
  name: string;
  template_type: 'transport' | 'general';
  kamoku: string | null;
  store: string | null;
  description: string | null;
  amount: number | null;
  payment_method: string;
  route_legs: RouteLeg[];
  green_amount: number;
  use_count: number;
  created_at: string;
  updated_at: string;
};

// 部門定義（定数）— 表示順もこの順
export const DIVISIONS = {
  youtube: { name: 'YouTube', label: 'YT', color: '#C23728', prefix: 'YT' },
  editorial: { name: '編集・体験設計', label: 'EDIT', color: '#81D8D0', prefix: 'ED' },
  thisplace: { name: 'THIS PLACE', label: 'TP', color: '#FF5F45', prefix: 'TP' },
  support: { name: '事業伴走・業務支援', label: 'SUP', color: '#D4A03A', prefix: 'SP' },
  general: { name: 'その他', label: 'GEN', color: '#C4B49A', prefix: 'GEN' },
} as const;

// 事業領域定義（定数）— 軸B：経営分析用
// DBの business_domains テーブルと id を同期すること
export const BUSINESS_DOMAINS = {
  branding:     { name: 'ブランディング・クリエイティブ受託', short: 'ブランディング' },
  consulting:   { name: '経営・マーケティング受託',           short: '経営・マーケ' },
  own_business: { name: '自主事業',                           short: '自主事業' },
} as const;

export type BusinessDomainKey = keyof typeof BUSINESS_DOMAINS;

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

  // 内部科目（UIに出さない。仕訳帳で自動生成用）
  prepaid: { name: '前払費用', type: 'asset', internal: true },
  advance_received: { name: '前受金', type: 'liability', internal: true },
  accounts_receivable: { name: '売掛金', type: 'asset', internal: true },
  accounts_payable: { name: '買掛金', type: 'liability', internal: true },
  jigyounushi_kari: { name: '事業主借', type: 'equity', internal: true },
  jigyounushi_kashi: { name: '事業主貸', type: 'equity', internal: true },
  bank_deposit: { name: '普通預金', type: 'asset', internal: true },
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

// 取引ステータス定義（PL/CFライフサイクル）
export const TRANSACTION_STATUS = {
  forecast: '見込み',
  accrued: '発生確定',
  billed: '請求済',
  settled: '決済完了',
} as const;

// 固定経費の頻度
export const RECURRING_FREQUENCY = {
  monthly: '毎月',
  quarterly: '四半期',
  annual: '年次',
} as const;

// 口座明細の照合ステータス
export const BANK_MATCH_STATUS = {
  unmatched: '未照合',
  matched: '照合済み',
  owner_deposit: '個人入金（事業主借）',
  owner_withdrawal: '個人引出（事業主貸）',
  internal_transfer: '口座間振替',
  ignored: '無視',
} as const;

// 請求書ステータス定義
export const INVOICE_STATUS = {
  draft: '下書き',
  issued: '発行済',
  paid: '入金済',
} as const;

export type InvoiceStatusKey = keyof typeof INVOICE_STATUS;

// 請求書 + 明細行（結合型）
export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  client?: Client;
};

// 取引先 + 請求書件数（一覧用）
export type ClientWithInvoiceCount = Client & {
  invoice_count: number;
};

// 資金移動パターンと仕訳ルール（Phase 4で使用）
// ① 個人→事業口座（資金注入）: 普通預金 / 事業主借 → match_status = owner_deposit
// ② クライアント→事業口座（売上入金）: 普通預金 / 売掛金 → match_status = matched
// ③ 事業口座→経費支払（デビット）: 科目 / 普通預金 → match_status = matched
// ④ 事業口座→個人口座（生活費引出）: 事業主貸 / 普通預金 → match_status = owner_withdrawal
// 口座開設日以降の経費は貸方「普通預金」、それ以前は「事業主借」（仕訳帳で自動判定）
