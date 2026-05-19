// komu10 会計システム v0.5.4
// Supabase Database 型定義（DB実態に完全一致）
// 2026-04-15 invoices: subject/due_date/payment_terms追加、period_start/end削除
// 2026-04-15 invoice_items: unit追加
// 2026-04-18 business_domains新設 / transactions.business_domain / projects.business_domain 追加
// 2026-04-18 contract_types を6区分に再定義（請負/準委任/スポット/継続課金/権利収入/その他）
// 2026-04-19 projects.invoice_display_name / transactions.item_description 追加（案件名・請求書件名・品名摘要の3層分離）
// 2026-04-21 v0.7 route_templates 新設（交通費テンプレから区間を分離し独立管理）
 
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
          // v0.17.0: 事業者ステータス（インボイス・課税判定）
          invoice_registered: boolean; // インボイス（適格請求書発行事業者）登録の有無
          invoice_number: string | null; // 登録番号（T+13桁）。未登録ならNULL
          is_taxable: boolean; // 課税事業者フラグ。インボイス登録済なら自動true扱い
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
          item_description: string | null; // 請求書明細行の品名・摘要（v0.5.4追加）
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
          invoice_id: string | null; // FK→invoices（v0.6.2追加: 源泉税仕訳など請求書紐付けで使用）
          sub_category: string | null; // v0.15.0: 制作費・取材費の内訳タグ（FK→sub_categories.key）
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
          name: string; // プロジェクト名（内部管理名）
          invoice_display_name: string | null; // 請求書に印字する対外的な件名（v0.5.4追加。NULL時はnameをフォールバック）
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
          status: string; // 'draft' | 'issued' | 'sent' | 'paid' | 'overdue'（v0.6.0で5種化）
          bank_account_id: string | null; // FK→bank_accounts（振込先）
          notes: string | null; // 備考
          drive_folder_id: string | null; // Google DriveフォルダID
          drive_file_id: string | null; // Google DriveファイルID
          pdf_url: string | null; // PDF URL
          issued_at: string | null; // 発行日時
          sent_at: string | null; // 送付完了日時（v0.6.0追加）
          paid_at: string | null; // 入金確認日時
          transaction_id: string | null; // FK→transactions（売上仕訳連携）
          // v0.6.0 請求書管理v2 — クライアント設定のスナップショット + オーバーライド
          withholding_tax: boolean; // 源泉徴収あり/なし
          withholding_basis: string; // 'tax_included' | 'tax_excluded'
          withholding_amount: number; // 源泉徴収額
          net_payment: number; // 差引振込額
          header_amount_type: string; // 'total' | 'net_payment'
          fee_burden: string; // 'client' | 'self'
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

      // v0.8.0: 請求書汎用テンプレ(マスタ)
      invoice_templates: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          name: string; // テンプレ名（例: 「月額顧問」「撮影スポット」）
          subject: string | null; // 件名デフォルト
          payment_terms: string | null; // 支払条件デフォルト
          notes: string | null; // 備考デフォルト
          bank_account_id: string | null; // FK→bank_accounts
          withholding_tax: boolean; // 源泉あり/なし
          withholding_basis: string; // 'tax_included' | 'tax_excluded'
          header_amount_type: string; // 'total' | 'net_payment'
          fee_burden: string; // 'client' | 'self'
          use_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoice_templates']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['invoice_templates']['Insert']>;
      };

      // v0.8.0: 請求書汎用テンプレ明細
      invoice_template_items: {
        Row: {
          id: string;
          template_id: string; // FK→invoice_templates (CASCADE)
          description: string;
          quantity: number;
          unit_price: number;
          tax_rate: number; // 0.10 = 10%
          amount: number;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoice_template_items']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['invoice_template_items']['Insert']>;
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
          payment_terms: string | null; // 支払条件（月末締翌月末 等）（自由記述・既存）
          notes: string | null;
          is_active: boolean;
          // v0.6.0 請求書管理v2 — 請求書デフォルト設定
          withholding_tax: boolean; // 源泉徴収あり/なし
          withholding_basis: string; // 'tax_included' | 'tax_excluded'
          header_amount_type: string; // 'total' | 'net_payment'
          fee_burden: string; // 'client' | 'self'
          payment_terms_type: string; // 'month_end_next_month_end' | 'other'
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

      // ルートテンプレート（v0.7: 交通費の物理経路を独立管理）
      // 経費テンプレ（業務メタ）とは分離された「再利用可能な経路マスタ」
      // v0.14.0: 仕様D — 片道テンプレ＋逆順ペア＋往復パッケージの3階層構造に拡張
      //   既存 direction/route_legs/amount は Phase 5 完了まで温存（削除は後続 migration）
      route_templates: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          name: string; // 例: 東京ルートJR 四ツ谷⇄藤沢
          direction: 'bidirectional' | 'oneway_only'; // [DEPRECATED v0.14.0] Phase 5 後に削除予定
          route_legs: RouteLeg[]; // 区間配列（仕様Dでは oneway 時のみ使用）
          amount: number; // [DEPRECATED v0.14.0] legs から動的計算に移行予定
          use_count: number; // 使用回数（よく使う順ソート用）
          sort_order: number;
          created_at: string;
          updated_at: string;
          // === v0.14.0 仕様D 追加カラム ===
          template_kind: 'oneway' | 'roundtrip_package'; // テンプレ種別
          paired_reverse_id: string | null; // 片道テンプレの逆順ペアID（oneway 時のみ設定）
          outbound_route_id: string | null; // パッケージの往路片道テンプレID（roundtrip_package 時のみ必須）
          return_route_id: string | null;   // パッケージの復路片道テンプレID（roundtrip_package 時のみ必須）
          archived_at: string | null; // 論理削除タイムスタンプ（v0.14.0 Phase 1.5）
        };
        Insert: Omit<Database['public']['Tables']['route_templates']['Row'], 'id' | 'created_at' | 'updated_at' | 'template_kind' | 'paired_reverse_id' | 'outbound_route_id' | 'return_route_id' | 'archived_at'> & {
          template_kind?: 'oneway' | 'roundtrip_package'; // 省略時は DB default 'oneway'
          paired_reverse_id?: string | null;
          outbound_route_id?: string | null;
          return_route_id?: string | null;
          archived_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['route_templates']['Insert']>;
      };

      // 経費領収書（v0.11.0: 1経費に最大10枚の領収書を紐付け）
      expense_receipts: {
        Row: {
          id: string;
          transaction_id: string;
          seq_no: number;
          label: string | null;
          drive_file_id: string;
          drive_url: string;
          drive_folder_path: string | null;
          generated_filename: string;
          original_filename: string | null;
          mime_type: string | null;
          ai_extracted_amount: number | null;
          old_filename: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['expense_receipts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['expense_receipts']['Insert']>;
      };

      // v0.15.0: 制作費・取材費の内訳タグマスタ
      sub_categories: {
        Row: {
          id: string;
          key: string;
          label: string;
          parent_kamoku: 'production' | 'torizai';
          display_order: number;
          is_active: boolean;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sub_categories']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['sub_categories']['Insert']>;
      };

      // v0.30.0: 所得控除タブ Phase 2 — 年×ユーザー×項目別サマリ
      tax_deductions: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          year: number; // 申告年(2026 = 令和8年分)
          deduction_key: string; // INCOME_DEDUCTION_KEY と一致
          amount: number | null; // 金額(円)
          text_value: string | null; // テキスト値(セルメデ要件メモ等)
          bool_value: boolean | null; // 真偽値(セルメデ要件充足等)
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tax_deductions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['tax_deductions']['Insert']>;
      };

      // v0.30.0: 医療費控除の追加明細
      medical_expense_details: {
        Row: {
          id: string;
          owner: string; // 'tomo' | 'toshiki'
          year: number;
          expense_date: string; // YYYY-MM-DD
          patient_type: 'self' | 'family' | 'other';
          patient_name: string | null;
          category: 'otc' | 'transport' | 'dental' | 'care' | 'other';
          vendor: string | null;
          amount: number;
          reimbursement: number;
          is_selfmed: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['medical_expense_details']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['medical_expense_details']['Insert']>;
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
export type InvoiceTemplate = Database['public']['Tables']['invoice_templates']['Row'];
export type InvoiceTemplateItem = Database['public']['Tables']['invoice_template_items']['Row'];
export type RevenueType = Database['public']['Tables']['revenue_types']['Row'];
export type RevenueTypeDivision = Database['public']['Tables']['revenue_type_divisions']['Row'];
export type ContractType = Database['public']['Tables']['contract_types']['Row'];
export type BusinessDomain = Database['public']['Tables']['business_domains']['Row'];
export type TransactionAllocation = Database['public']['Tables']['transaction_allocations']['Row'];
export type RouteTemplate = Database['public']['Tables']['route_templates']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type RecurringExpense = Database['public']['Tables']['recurring_expenses']['Row'];
export type EquipmentItem = Database['public']['Tables']['equipment_items']['Row'];
export type ExpenseReceipt = Database['public']['Tables']['expense_receipts']['Row'];
export type SubCategory = Database['public']['Tables']['sub_categories']['Row'];
 
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
// v0.15.8: TransportFields の RouteLeg と統一（旧 green_available/green_surcharge を撤廃）
// DB JSONB 上の実態フィールドに合わせる。同名の型がコンポーネント側にあったが、
// 真実はこちら(database.ts)に一本化する。
export type RouteLeg = {
  from: string;
  to: string;
  method: string;
  carrier: string;
  amount: number;
  green: boolean;
  // v0.30.0: 区間レベルの詳細フィールド(全てoptional・既存データは後方互換)
  green_amount?: number;        // 普通電車のグリーン料金別入力
  class_value?: string;         // 座席クラス
  class_reason?: string;        // 上位クラス選択時の業務理由
  client_name?: string;         // 「クライアント同行」選択時の相手先(税務証跡)
  flight_train_no?: string;     // 便名・列車名
  passenger_count?: number;     // 人数(自分含む)・デフォルト1
  companion_memo?: string;      // 同行者メモ(任意)
};
 
export type TemplateAllocation = {
  division_id: string;
  project_id: string | null;
  percent: number;
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
  allocations: TemplateAllocation[];
  use_count: number;
  transport_purpose: string | null; // v0.7: 交通費テンプレの目的（業務メタ化）
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
  torizai: { name: '取材費', type: 'expense', anbun: false },
  meeting: { name: '会議費', type: 'expense', anbun: false },
  welfare: { name: '福利厚生費', type: 'expense', anbun: false, is_active: false }, // v0.29.0: 個人事業主期間中は計上不可のため非表示(法人化時にtrueへ)
  supplies: { name: '事務用品費', type: 'expense', anbun: false },
  outsource: { name: '外注費', type: 'expense', anbun: false },
  production: { name: '制作費', type: 'expense', anbun: false },
  advertising: { name: '広告宣伝費', type: 'expense', anbun: false },
  rent: { name: '地代家賃', type: 'expense', anbun: true },
  utility: { name: '水道光熱費', type: 'expense', anbun: true },
  insurance: { name: '保険料', type: 'expense', anbun: false },
  depreciation: { name: '減価償却費', type: 'expense', anbun: false },
  vehicle: { name: '車両費', type: 'expense', anbun: true },
  tax: { name: '租税公課', type: 'expense', anbun: false },
  commission: { name: '支払手数料', type: 'expense', anbun: false },
  subscription: { name: 'サブスクリプション', type: 'expense', anbun: true },
  software: { name: 'ソフトウェア', type: 'expense', anbun: true },
  training: { name: '研修費', type: 'expense', anbun: false },
  repair: { name: '修繕費', type: 'expense', anbun: false },
  misc: { name: '雑費', type: 'expense', anbun: false },
 
  // 内部科目（UIに出さない。仕訳帳で自動生成用）
  prepaid: { name: '前払費用', type: 'asset', internal: true },
  prepaid_withholding: { name: '仮払源泉税', type: 'asset', internal: true }, // v0.6.0 請求書管理v2
  advance_received: { name: '前受金', type: 'liability', internal: true },
  accounts_receivable: { name: '売掛金', type: 'asset', internal: true },
  accounts_payable: { name: '買掛金', type: 'liability', internal: true },
  jigyounushi_kari: { name: '事業主借', type: 'equity', internal: true },
  jigyounushi_kashi: { name: '事業主貸', type: 'equity', internal: true },
  bank_deposit: { name: '普通預金', type: 'asset', internal: true },
} as const;

// v0.8.2: 案件タグ（project_id）必須化対象科目
// allocations配列のうち最低1行で project_id の選択が必須
export const PROJECT_TAG_REQUIRED_KAMOKU = ['torizai', 'production'] as const;

// v0.13.0: 摘要（description）必須化対象科目
// 取材費・制作費は内容・摘要の記入を必須とする（業務関連性の証跡）
export const DESCRIPTION_REQUIRED_KAMOKU = ['torizai', 'production'] as const;

// v0.13.0: 交通費詳細フィールドを表示する科目
// 旅費交通費に加え、制作費・取材費でも交通系領収書を扱うため詳細入力を共通化
// v0.15.0: 制作費・取材費では「内訳=移動」の時だけ展開される条件付き表示に変更
export const TRANSPORT_DETAIL_KAMOKU = ['travel', 'production', 'torizai'] as const;
export function usesTransportDetail(kamoku: string): boolean {
  return (TRANSPORT_DETAIL_KAMOKU as readonly string[]).includes(kamoku);
}

// v0.15.0: 内訳タグ（sub_category）必須化対象科目
// 制作費・取材費は内訳タグの選択を必須とする（管理会計の粒度統一・証跡強化）
export const SUB_CATEGORY_REQUIRED_KAMOKU = ['production', 'torizai'] as const;
export function requiresSubCategory(kamoku: string): boolean {
  return (SUB_CATEGORY_REQUIRED_KAMOKU as readonly string[]).includes(kamoku);
}

// v0.15.0: 複数領収書添付が許可される科目
// 旅費交通費: 1トリップ=1取引の実務慣行により最大10枚
// v0.15.1: 制作費・取材費も追加（トモが2人分まとめて決済等、同一取引で複数領収書が発生するため）
// その他経費は1領収書=1取引の原則に従い1枚まで
export const MULTI_RECEIPT_KAMOKU = ['travel', 'production', 'torizai'] as const;
export function allowsMultipleReceipts(kamoku: string): boolean {
  return (MULTI_RECEIPT_KAMOKU as readonly string[]).includes(kamoku);
}

// v0.15.0: 内訳タグ「移動」系のキー
// 制作費/取材費の内訳タグが「移動」の時だけ交通費詳細UIを展開する判定に使用
// システムシードのキー prod_transport / tori_transport に加え、
// 新規追加タグで label が「移動」「交通」を含むものも自動判定
export const TRANSPORT_SUB_CATEGORY_SYSTEM_KEYS = ['prod_transport', 'tori_transport'] as const;
export function isTransportSubCategory(subCategory: string | null | undefined, label?: string | null): boolean {
  if (!subCategory) return false;
  if ((TRANSPORT_SUB_CATEGORY_SYSTEM_KEYS as readonly string[]).includes(subCategory)) return true;
  if (label && (label.includes('移動') || label.includes('交通'))) return true;
  return false;
}

// v0.27.0: 科目バナー切替時の内訳タグ自動推定マップ
// AI が判定した「元の科目」から、制作費(production)・取材費(torizai)に振替えた時に
// 内訳タグ(sub_category)を自動セットして「内訳*必須」のバリデーションエラーを防ぐ。
// マッピング根拠：元科目の意味的性質はそのまま、制作・取材の文脈に再分類する設計。
// - travel        → 移動         (prod_transport / tori_transport)
// - entertainment → 飲食         (prod_meal      / tori_meal)
// - meeting       → 飲食
// - welfare       → 飲食
// - supplies      → 小道具・備品 (prod_props)  / 資料 (tori_reference)
// - equipment     → 小道具・備品 / 資料
// - misc          → その他       (prod_other   / tori_other)
const SUB_CATEGORY_INFERENCE_BY_KAMOKU: Record<string, { production: string; torizai: string }> = {
  travel:        { production: 'prod_transport', torizai: 'tori_transport' },
  entertainment: { production: 'prod_meal',      torizai: 'tori_meal' },
  meeting:       { production: 'prod_meal',      torizai: 'tori_meal' },
  welfare:       { production: 'prod_meal',      torizai: 'tori_meal' },
  supplies:      { production: 'prod_props',     torizai: 'tori_reference' },
  equipment:     { production: 'prod_props',     torizai: 'tori_reference' },
  misc:          { production: 'prod_other',     torizai: 'tori_other' },
};

// v0.27.0: 科目バナー切替時の内訳タグ推定
// AI 判定結果(fromKamoku) → 制作費/取材費(toKamoku) への振替時に
// 内訳タグを推定して返す。AI ヒント(aiSubCategoryHint)が優先される。
export function inferSubCategoryOnKamokuSwitch(
  fromKamoku: string,
  toKamoku: 'production' | 'torizai',
  aiSubCategoryHint: string | null | undefined
): string {
  // AI ヒントが切替先と同系統(prod_*/tori_*)なら最優先
  const expectedPrefix = toKamoku === 'production' ? 'prod_' : 'tori_';
  if (aiSubCategoryHint && aiSubCategoryHint.startsWith(expectedPrefix)) {
    return aiSubCategoryHint;
  }
  // フォールバック：元科目からのマッピング表
  const mapping = SUB_CATEGORY_INFERENCE_BY_KAMOKU[fromKamoku];
  if (mapping) return mapping[toKamoku];
  return '';
}

// v0.13.0: 「PJ未登録案件」を表すフロント専用識別子
// 企画段階で正式PJ化前の制作費・取材費でPJ必須をクリアするために使用
// DB保存時は project_id = null に変換される
export const UNASSIGNED_PROJECT_VALUE = '__unassigned__';
export const UNASSIGNED_PROJECT_LABEL = '（PJ未登録案件）';

// v0.8.2: 科目別の記入ガイドヘルプテキスト（TransactionModal/Uploaderで表示）
// v0.29.0: 取材費・制作費を税務調査対策の証跡作法に沿って加筆。会議費・研修費を新規追加。
export const KAMOKU_INPUT_GUIDE: Record<string, { title: string; body: string; example: string; requireProject: boolean; requireDescription?: boolean }> = {
  torizai: {
    title: '取材費の記入ポイント',
    body: '摘要には「取材対象」と「取材目的」を明記してください。取材活動の一部としての飲食(取材対象に同席いただく食事代等)に限り、内訳「飲食」で計上できます。単に取材日の昼食では計上できません。',
    example: '湯河原温泉旅館○○ 代表インタビュー',
    requireProject: true,
    requireDescription: true,
  },
  production: {
    title: '制作費の記入ポイント',
    body: '購入物と使用目的を簡潔に記載。撮影専用の衣装・小道具を全額計上する場合は、撮影直後の保管状態の写真や着用記録を残すと税務調査時に立証しやすくなります。私服兼用が想定される衣服は事業比率での按分が必要です。',
    example: 'シャツ2点 出演衣装(撮影専用・自宅保管) ／ 撮影題材のホテル代',
    requireProject: true,
    requireDescription: true,
  },
  meeting: {
    title: '会議費の記入ポイント',
    body: '1人あたり5,000円以下が会議費の目安。超える場合は接待交際費を選択してください。摘要には「相手」と「目的」を記載してください。',
    example: '○○社 鈴木様 打合せカフェ代',
    requireProject: false,
  },
  training: {
    title: '研修費の記入ポイント',
    body: '摘要には「業務との接続」を1文で記載してください。申込画面・受講証明書のスクショを領収書に添付すると証跡が強くなります。自己啓発色が強い研修は否認リスクがあるため業務関連性を明示してください。',
    example: '○○マーケティング講座(YT動画分析手法習得・Scene Notes視聴者分析業務に直結)',
    requireProject: false,
  },
};
 
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
 
// 請求書ステータス定義（v0.51.0で3種化:発行/送付済/入金済）
// 旧: draft/overdue は廃止。「作る=発行」が同義(ハンドオフs100§2.3)
export const INVOICE_STATUS = {
  issued: '発行',
  sent: '送付済',
  paid: '入金済',
} as const;
 
export type InvoiceStatusKey = keyof typeof INVOICE_STATUS;

// v0.6.0 請求書管理v2 — 補助型・ラベル定数
export type WithholdingBasis = 'tax_included' | 'tax_excluded';
export const WITHHOLDING_BASIS_LABEL: Record<WithholdingBasis, string> = {
  tax_included: '税込',
  tax_excluded: '税抜',
};

export type HeaderAmountType = 'total' | 'net_payment';
export const HEADER_AMOUNT_TYPE_LABEL: Record<HeaderAmountType, string> = {
  total: '請求総額',
  net_payment: '差引振込額',
};

export type FeeBurden = 'client' | 'self';
export const FEE_BURDEN_LABEL: Record<FeeBurden, string> = {
  client: '先方負担',
  self: '自社負担',
};

// v0.51.0(s101): 経営企画チケットv2 リグレッション① 対応
// 「お支払条件」を3種から選択可能に拡張
// - contract_based: 「契約書記載の支払条件に準ずる」(従来デフォルト)
// - month_end_next_month_end: 「月末締翌月末払い」(具体記載)
// - custom: 自由入力(clients.payment_terms カラムを使用)
export type PaymentTermsType = 'contract_based' | 'month_end_next_month_end' | 'custom';
export const PAYMENT_TERMS_TYPE_LABEL: Record<PaymentTermsType, string> = {
  contract_based: '契約書記載の支払条件に準ずる',
  month_end_next_month_end: '月末締翌月末払い',
  custom: '自由入力',
};
 
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
 














