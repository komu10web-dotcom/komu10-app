import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

let _supabase: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase環境変数が設定されていません');
    }
    _supabase = createClient<Database>(url, key);
  }
  return _supabase;
}

// 後方互換（既存コードが import { supabase } で使っている箇所用）
export const supabase = typeof window !== 'undefined'
  ? createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )
  : (null as any);
