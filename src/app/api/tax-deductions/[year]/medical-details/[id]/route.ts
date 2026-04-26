import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// PATCH /api/tax-deductions/[year]/medical-details/[id]
// 医療費明細1件の編集
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ year: string; id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'id が必要です' }, { status: 400 });
    }

    // 編集可能フィールドのみ抽出
    const updates: Record<string, unknown> = {};
    if (body.expense_date !== undefined) updates.expense_date = body.expense_date;
    if (body.patient_type !== undefined) {
      if (!['self', 'family', 'other'].includes(body.patient_type)) {
        return NextResponse.json({ success: false, error: 'patient_type が不正です' }, { status: 400 });
      }
      updates.patient_type = body.patient_type;
    }
    if (body.patient_name !== undefined) updates.patient_name = body.patient_name;
    if (body.category !== undefined) {
      if (!['otc', 'transport', 'dental', 'care', 'other'].includes(body.category)) {
        return NextResponse.json({ success: false, error: 'category が不正です' }, { status: 400 });
      }
      updates.category = body.category;
    }
    if (body.vendor !== undefined) updates.vendor = body.vendor;
    if (body.amount !== undefined) {
      const amt = Number(body.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        return NextResponse.json({ success: false, error: 'amount が不正です' }, { status: 400 });
      }
      updates.amount = amt;
    }
    if (body.reimbursement !== undefined) updates.reimbursement = Number(body.reimbursement);
    if (body.is_selfmed !== undefined) updates.is_selfmed = Boolean(body.is_selfmed);
    if (body.note !== undefined) updates.note = body.note;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: '更新項目がありません' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('medical_expense_details')
      .update(updates)
      .eq('id', id)
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

// DELETE /api/tax-deductions/[year]/medical-details/[id]
// 医療費明細1件の削除(audit_log に自動記録される)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ year: string; id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'id が必要です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase
      .from('medical_expense_details')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
