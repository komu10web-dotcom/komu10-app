// ============================================================
// v0.52.0: テストデータ一括削除API
// ============================================================
// is_test=true の invoices / transactions を一括削除
// invoice_items は invoices の物理削除に CASCADE 連動(既存制約)
// SQL v0.51.0 で transactions.invoice_id は ON DELETE SET NULL なので、
// invoice 先削除 → 連動 tx も削除の順で実行
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. テストデータ件数カウント(削除前のレポート用)
    const { count: invCount } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('is_test', true);

    const { count: txCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('is_test', true);

    const { count: pjCount } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('is_test', true);

    const { count: clCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_test', true);

    // 2. テスト invoices 削除(invoice_items は CASCADE)
    const { error: invErr } = await supabase
      .from('invoices')
      .delete()
      .eq('is_test', true);
    if (invErr) throw invErr;

    // 3. テスト transactions 削除
    const { error: txErr } = await supabase
      .from('transactions')
      .delete()
      .eq('is_test', true);
    if (txErr) throw txErr;

    // 4. テスト projects 削除(sssas事件の修正・v0.53.0)
    const { error: pjErr } = await supabase
      .from('projects')
      .delete()
      .eq('is_test', true);
    if (pjErr) throw pjErr;

    // 5. テスト clients 削除(SEED取引先含む・v0.53.0)
    const { error: clErr } = await supabase
      .from('clients')
      .delete()
      .eq('is_test', true);
    if (clErr) throw clErr;

    // 6. テスト用採番カウンタもリセット
    const { error: counterErr } = await supabase
      .from('invoice_number_counters')
      .update({ last_number: 0 })
      .eq('is_test', true);
    if (counterErr) throw counterErr;

    return NextResponse.json({
      success: true,
      deleted: {
        invoices: invCount || 0,
        transactions: txCount || 0,
        projects: pjCount || 0,
        clients: clCount || 0,
      },
    });
  } catch (err: any) {
    console.error('[clear-test-data] error', err);
    return NextResponse.json(
      { success: false, error: err.message || '不明なエラー' },
      { status: 500 }
    );
  }
}
