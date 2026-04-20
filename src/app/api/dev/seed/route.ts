import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// v0.6.1: 開発者向けシードデータ投入/削除API
// ダミーの取引先・請求書を一括投入/削除し、実機テストを可能にする。
// 【重要】本番データに影響しないよう、シードデータには識別子 `__SEED__` を付与。
// 削除時は識別子で厳密マッチして削除する（誤削除防止）。
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const SEED_TAG = '__SEED__';

// ------------------------------------------------------------
// POST: シードデータ投入
// body: { owner: 'tomo' | 'toshiki' }
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { owner } = await request.json();
    if (!owner || !['tomo', 'toshiki'].includes(owner)) {
      return NextResponse.json({ success: false, error: 'owner が不正です' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 既存シードを先に削除（再実行時の重複防止）
    await cleanupSeed(supabase, owner);

    // 取引先番号の採番（既存の最大+1から連番で2件）
    const { data: existingClients } = await supabase
      .from('clients')
      .select('client_number')
      .eq('owner', owner)
      .order('client_number', { ascending: false })
      .limit(1);
    const maxNum = existingClients?.[0] ? parseInt(existingClients[0].client_number) : 0;
    const cn1 = String(maxNum + 1).padStart(3, '0');
    const cn2 = String(maxNum + 2).padStart(3, '0');

    // 取引先A: 源泉あり
    const { data: clientA, error: errA } = await supabase.from('clients').insert({
      owner,
      client_number: cn1,
      name: `${SEED_TAG} テスト源泉あり社`,
      short_name: 'TEST-A',
      postal_code: '100-0001',
      address: '東京都千代田区千代田1-1',
      contact_name: 'テスト太郎',
      contact_email: 'test-a@example.com',
      payment_terms: '月末締翌月末',
      notes: `${SEED_TAG} 検証用ダミー取引先（源泉徴収あり・税込基準・冒頭差引振込額）`,
      is_active: true,
      withholding_tax: true,
      withholding_basis: 'tax_included',
      header_amount_type: 'net_payment',
      fee_burden: 'client',
      payment_terms_type: 'month_end_next_month_end',
    }).select('id').single();
    if (errA) throw errA;

    // 取引先B: 源泉なし
    const { data: clientB, error: errB } = await supabase.from('clients').insert({
      owner,
      client_number: cn2,
      name: `${SEED_TAG} テスト源泉なし社`,
      short_name: 'TEST-B',
      postal_code: '150-0001',
      address: '東京都渋谷区神宮前1-1',
      contact_name: 'テスト花子',
      contact_email: 'test-b@example.com',
      payment_terms: '月末締翌月末',
      notes: `${SEED_TAG} 検証用ダミー取引先（源泉徴収なし・冒頭請求総額）`,
      is_active: true,
      withholding_tax: false,
      withholding_basis: 'tax_included',
      header_amount_type: 'total',
      fee_burden: 'client',
      payment_terms_type: 'month_end_next_month_end',
    }).select('id').single();
    if (errB) throw errB;

    // 振込先口座の取得（既存のものがあれば使う、なければnull）
    const { data: bank } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('owner', owner)
      .limit(1)
      .maybeSingle();
    const bankId = bank?.id || null;

    const today = new Date().toISOString().slice(0, 10);
    const year = new Date().getFullYear();

    // v0.6.3: 請求書番号はTEST-INV-プレフィックスで本番連番から独立
    const { data: lastInv } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `TEST-INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1);
    const lastInvNum = lastInv?.[0]
      ? parseInt(lastInv[0].invoice_number.split('-')[3])
      : 0;

    // 請求書A: 源泉あり社向け・ドラフト
    const invNumA = `TEST-INV-${year}-${String(lastInvNum + 1).padStart(4, '0')}`;
    const { data: invA, error: iErrA } = await supabase.from('invoices').insert({
      owner,
      client_id: clientA.id,
      invoice_number: invNumA,
      issue_date: today,
      due_date: null,
      subject: `${SEED_TAG} 検証用案件A（源泉あり）`,
      payment_terms: '契約書記載の支払条件に準ずる',
      subtotal: 100000,
      tax_amount: 0,
      total: 100000,
      status: 'draft',
      bank_account_id: bankId,
      notes: `${SEED_TAG} テスト請求書A`,
      withholding_tax: true,
      withholding_basis: 'tax_included',
      withholding_amount: 10210,
      net_payment: 89790,
      header_amount_type: 'net_payment',
      fee_burden: 'client',
    }).select('id').single();
    if (iErrA) throw iErrA;

    await supabase.from('invoice_items').insert([
      {
        invoice_id: invA.id,
        sort_order: 1,
        description: '検証用業務委託（メイン）',
        quantity: 1,
        unit: '式',
        unit_price: 80000,
        amount: 80000,
      },
      {
        invoice_id: invA.id,
        sort_order: 2,
        description: '検証用追加作業',
        quantity: 1,
        unit: '式',
        unit_price: 20000,
        amount: 20000,
      },
    ]);

    // 請求書B: 源泉なし社向け・ドラフト
    const invNumB = `TEST-INV-${year}-${String(lastInvNum + 2).padStart(4, '0')}`;
    const { data: invB, error: iErrB } = await supabase.from('invoices').insert({
      owner,
      client_id: clientB.id,
      invoice_number: invNumB,
      issue_date: today,
      due_date: null,
      subject: `${SEED_TAG} 検証用案件B（源泉なし）`,
      payment_terms: '契約書記載の支払条件に準ずる',
      subtotal: 50000,
      tax_amount: 0,
      total: 50000,
      status: 'draft',
      bank_account_id: bankId,
      notes: `${SEED_TAG} テスト請求書B`,
      withholding_tax: false,
      withholding_basis: 'tax_included',
      withholding_amount: 0,
      net_payment: 50000,
      header_amount_type: 'total',
      fee_burden: 'client',
    }).select('id').single();
    if (iErrB) throw iErrB;

    await supabase.from('invoice_items').insert([
      {
        invoice_id: invB.id,
        sort_order: 1,
        description: '検証用制作物',
        quantity: 1,
        unit: '式',
        unit_price: 50000,
        amount: 50000,
      },
    ]);

    return NextResponse.json({
      success: true,
      summary: {
        clients: 2,
        invoices: 2,
        invoice_items: 3,
        clientA: { id: clientA.id, number: cn1 },
        clientB: { id: clientB.id, number: cn2 },
        invoiceA: { id: invA.id, number: invNumA },
        invoiceB: { id: invB.id, number: invNumB },
      },
    });
  } catch (error) {
    console.error('Seed投入エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// ------------------------------------------------------------
// DELETE: シードデータ削除（__SEED__ タグで厳密マッチ）
// ------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const { owner } = await request.json();
    if (!owner || !['tomo', 'toshiki'].includes(owner)) {
      return NextResponse.json({ success: false, error: 'owner が不正です' }, { status: 400 });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const result = await cleanupSeed(supabase, owner);
    return NextResponse.json({ success: true, summary: result });
  } catch (error) {
    console.error('Seed削除エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// ------------------------------------------------------------
// 内部: シードデータ削除ロジック
// ------------------------------------------------------------
async function cleanupSeed(supabase: any, owner: string) {
  // 1. __SEED__ タグ付き取引先を特定
  const { data: seedClients } = await supabase
    .from('clients')
    .select('id')
    .eq('owner', owner)
    .ilike('name', `${SEED_TAG}%`);

  const clientIds = (seedClients || []).map((c: any) => c.id);
  let invoiceCount = 0;
  let itemCount = 0;
  let txCount = 0;

  if (clientIds.length > 0) {
    // 2. シード取引先に紐づく請求書を特定
    const { data: seedInvoices } = await supabase
      .from('invoices')
      .select('id')
      .in('client_id', clientIds);
    const invoiceIds = (seedInvoices || []).map((i: any) => i.id);

    if (invoiceIds.length > 0) {
      // 3. invoice_items 削除
      const { count: ic } = await supabase
        .from('invoice_items')
        .delete({ count: 'exact' })
        .in('invoice_id', invoiceIds);
      itemCount = ic || 0;

      // 4. シード請求書紐づき transactions を削除
      const { count: tc } = await supabase
        .from('transactions')
        .delete({ count: 'exact' })
        .in('invoice_id', invoiceIds);
      txCount = tc || 0;

      // 5. invoices 削除
      const { count: vc } = await supabase
        .from('invoices')
        .delete({ count: 'exact' })
        .in('id', invoiceIds);
      invoiceCount = vc || 0;
    }

    // 6. clients 削除
    await supabase.from('clients').delete().in('id', clientIds);
  }

  return {
    clients: clientIds.length,
    invoices: invoiceCount,
    invoice_items: itemCount,
    transactions: txCount,
  };
}
