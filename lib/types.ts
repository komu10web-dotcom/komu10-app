// ═══════════════════════════════════════════════════════════════
// komu10 型定義
// ═══════════════════════════════════════════════════════════════

export interface Profile {
  id: string;
  user_key: string;
  display_name: string;
  theme: string;
  gas_api_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  tx_type: 'expense' | 'revenue';
  date: string;
  amount: number;
  kamoku: string;
  division: string;
  owner: string;
  store: string | null;
  description: string | null;
  memo: string | null;
  project_id: string | null;
  tags: string[];
  revenue_type: string | null;
  source: string;
  ai_confidence: number | null;
  confirmed: boolean;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  division: string;
  owner: string;
  status: 'ordered' | 'active' | 'completed';
  client: string | null;
  youtube_id: string | null;
  category: string | null;
  location: string | null;
  shoot_date: string | null;
  publish_date: string | null;
  budget: number | null;
  target_revenue: number | null;
  note: string | null;
  tags: string[];
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  owner: string;
  acquisition_date: string;
  acquisition_cost: number;
  useful_life: number;
  business_use_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface AnbunSetting {
  id: string;
  kamoku: string;
  owner: string;
  ratio: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}
