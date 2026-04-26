import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// GET /api/tax-deductions/[year]/medical-details?owner=tomo
// 医療費明細を取得(年×ユーザー)
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
    if (!Number.isFinite(yearNum)) {
      return NextResponse.json({ success: false, error: 'year パラメータが不正です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('medical_expense_details')
      .select('*')
      .eq('owner', owner)
      .eq('year', yearNum)
      .order('expense_date', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/tax-deductions/[year]/medical-details
// 医療費明細を1件追加
// body: { owner, expense_date, patient_type, patient_name?, category, vendor?, amount, reimbursement?, is_selfmed?, note? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  try {
    const { year } = await params;
    const yearNum = parseInt(year, 10);
    const body = await request.json();

    if (!Number.isFinite(yearNum)) {
      return NextResponse.json({ success: false, error: 'year パラメータが不正です' }, { status: 400 });
    }

    const owner = body.owner;
    const expense_date = body.expense_date;
    const patient_type = body.patient_type;
    const category = body.category;
    const amount = Number(body.amount);

    if (!owner || (owner !== 'tomo' && owner !== 'toshiki')) {
      return NextResponse.json({ success: false, error: 'owner が不正です' }, { status: 400 });
    }
    if (!expense_date) {
      return NextResponse.json({ success: false, error: 'expense_date が必要です' }, { status: 400 });
    }
    if (!['self', 'family', 'other'].includes(patient_type)) {
      return NextResponse.json({ success: false, error: 'patient_type が不正です' }, { status: 400 });
    }
    if (!['otc', 'transport', 'dental', 'care', 'other'].includes(category)) {
      return NextResponse.json({ success: false, error: 'category が不正です' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ success: false, error: 'amount が不正です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = {
      owner,
      year: yearNum,
      expense_date,
      patient_type,
      patient_name: body.patient_name ?? null,
      category,
      vendor: body.vendor ?? null,
      amount,
      reimbursement: Number(body.reimbursement ?? 0),
      is_selfmed: Boolean(body.is_selfmed ?? false),
      note: body.note ?? null,
    };

    const { data, error } = await supabase
      .from('medical_expense_details')
      .insert(payload)
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
