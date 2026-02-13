import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// クライアントサイド用
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// サーバーサイド用（Service Role Key）
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

// 型定義
export interface Transaction {
  id: string;
  tx_type: 'expense' | 'revenue';
  date: string;
  amount: number;
  kamoku: string;
  division: string;
  owner: string;
  store?: string;
  description?: string;
  memo?: string;
  project_id?: string;
  tags?: string[];
  revenue_type?: string;
  source?: string;
  ai_confidence?: number;
  confirmed?: boolean;
  external_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  seq_no?: number;
  name: string;
  division: string;
  owner: string;
  status: 'ordered' | 'active' | 'completed';
  client?: string;
  youtube_id?: string;
  category?: string;
  location?: string;
  shoot_date?: string;
  publish_date?: string;
  budget?: number;
  target_revenue?: number;
  note?: string;
  tags?: string[];
  external_id?: string;
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
}

export interface AnbunSetting {
  id: string;
  kamoku: string;
  owner: string;
  ratio: number;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  user_key: string;
  display_name: string;
  theme?: string;
  gas_api_url?: string;
  created_at?: string;
  updated_at?: string;
}
