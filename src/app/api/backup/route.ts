import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const TABLES = [
  'transactions',
  'transaction_allocations',
  'projects',
  'assets',
  'anbun_settings',
  'transport_details',
  'profiles',
  'revenue_types',
  'revenue_type_divisions',
  'contract_types',
] as const;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const backup: Record<string, any[]> = {};

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.error(`Backup error for ${table}:`, error);
        backup[table] = [];
      } else {
        backup[table] = data || [];
      }
    }

    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const json = JSON.stringify({
      exported_at: new Date().toISOString(),
      tables: backup,
      table_counts: Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length])),
    }, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="komu10-backup-${now}.json"`,
      },
    });
  } catch (err) {
    console.error('Backup error:', err);
    return NextResponse.json({ error: 'バックアップに失敗しました' }, { status: 500 });
  }
}
