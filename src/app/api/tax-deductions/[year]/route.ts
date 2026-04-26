import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// GET /api/tax-deductions/[year]?owner=tomo
// 年×ユーザーの所得控除サマリ全件を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  try {
    const { year } = await params;
    const yearNum = parseInt(year, 10);
    const owner = request.nextUrl.searchParams.get('owner');

    if (!owner || (owner !== 'tomo' && owner !== 'toshiki')) {
      return NextResponse.json({ success: false, error: 'owner パラメータが不正です' }, { status: 400 });
    }
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return NextResponse.json({ success: false, error: 'year パラメータが不正です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('tax_deductions')
      .select('*')
      .eq('owner', owner)
      .eq('year', yearNum)
      .order('deduction_key', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

// PUT /api/tax-deductions/[year]
// 単一項目の保存(blur自動保存用)。upsert する。
// body: { owner, deduction_key, amount?, text_value?, bool_value? }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  try {
    const { year } = await params;
    const yearNum = parseInt(year, 10);
    const body = await request.json();
    const { owner, deduction_key, amount, text_value, bool_value } = body;

    if (!owner || (owner !== 'tomo' && owner !== 'toshiki')) {
      return NextResponse.json({ success: false, error: 'owner パラメータが不正です' }, { status: 400 });
    }
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return NextResponse.json({ success: false, error: 'year パラメータが不正です' }, { status: 400 });
    }
    if (!deduction_key || typeof deduction_key !== 'string') {
      return NextResponse.json({ success: false, error: 'deduction_key が不正です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = {
      owner,
      year: yearNum,
      deduction_key,
      amount: amount === undefined || amount === null || amount === '' ? null : Number(amount),
      text_value: text_value === undefined ? null : text_value,
      bool_value: bool_value === undefined ? null : bool_value,
    };

    const { data, error } = await supabase
      .from('tax_deductions')
      .upsert(payload, { onConflict: 'owner,year,deduction_key' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
