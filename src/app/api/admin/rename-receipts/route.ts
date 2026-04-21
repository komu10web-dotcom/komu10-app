import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReceiptFilename } from '@/lib/receiptFilename';
import { KAMOKU } from '@/types/database';

const GAS_URL = process.env.DEFAULT_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbwiGFVxofGPnaPJnox_K7GeW01elk9ZGPoN0dWC9bi9hqoKdEmXbGtxQZjDRWw94oah/exec';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * 既存領収書ファイル一括リネームAPI（v0.12.0 / Sprint 3）
 *
 * POST body:
 *   { mode: 'dry-run' | 'execute' }
 *
 * 動作:
 *   - expense_receipts 全件を対象に、transactions を JOIN して命名規則適用
 *   - 既に新命名規則（YYYYMMDD_ で始まる）のファイルはスキップ
 *   - dry-run: 対応表を返すのみ、DB/Driveに変更なし
 *   - execute: Drive API で name 更新 → DB に old_filename と新 generated_filename を保存
 *   - 失敗はスキップして続行、レポートに失敗詳細を含める
 */
export async function POST(request: NextRequest) {
  try {
    const { mode } = await request.json();
    if (mode !== 'dry-run' && mode !== 'execute') {
      return NextResponse.json({ success: false, error: 'mode は dry-run または execute を指定してください' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ① 対象レコード取得（transactions JOIN）
    const { data: receipts, error: fetchErr } = await supabase
      .from('expense_receipts')
      .select(`
        id,
        transaction_id,
        seq_no,
        label,
        drive_file_id,
        generated_filename,
        original_filename,
        transactions!inner (
          date,
          kamoku,
          store,
          owner,
          description
        )
      `)
      .order('created_at', { ascending: true });

    if (fetchErr) {
      return NextResponse.json({ success: false, error: `DB取得失敗: ${fetchErr.message}` }, { status: 500 });
    }
    if (!receipts || receipts.length === 0) {
      return NextResponse.json({ success: true, mode, total: 0, targets: [], skipped: [], renamed: [], failed: [] });
    }

    // ② 勘定科目ラベル取得（KAMOKU定数）
    const getKamokuLabel = (code: string): string => {
      const entry = (KAMOKU as Record<string, { name: string }>)[code];
      return entry?.name || code || 'その他';
    };

    // ③ 新名生成（全件）
    type PlanItem = {
      receiptId: string;
      fileId: string;
      oldName: string;
      newName: string;
    };
    const targets: PlanItem[] = [];
    const skipped: Array<{ receiptId: string; reason: string; filename: string }> = [];

    for (const r of receipts as any[]) {
      const tx = r.transactions;
      if (!tx) {
        skipped.push({ receiptId: r.id, reason: 'トランザクション未紐付', filename: r.generated_filename || '' });
        continue;
      }

      const oldName = r.generated_filename || '';
      // 既に新命名規則のものはスキップ（YYYYMMDD_ で始まる8桁数字プレフィックス）
      if (/^\d{8}_/.test(oldName)) {
        skipped.push({ receiptId: r.id, reason: '既に新命名規則', filename: oldName });
        continue;
      }

      const newName = generateReceiptFilename({
        date: tx.date,
        kamoku_label: getKamokuLabel(tx.kamoku),
        store: tx.store,
        owner: tx.owner,
        description: tx.description,
        seq_no: r.seq_no || 1,
        label: r.label,
        original_filename: r.original_filename || oldName || 'file.bin',
      });

      if (newName === oldName) {
        skipped.push({ receiptId: r.id, reason: '新名と同一', filename: oldName });
        continue;
      }

      targets.push({
        receiptId: r.id,
        fileId: r.drive_file_id,
        oldName,
        newName,
      });
    }

    // ④ dry-run なら対応表を返して終了
    if (mode === 'dry-run') {
      return NextResponse.json({
        success: true,
        mode: 'dry-run',
        total: receipts.length,
        targets,
        skipped,
        renamed: [],
        failed: [],
      });
    }

    // ⑤ execute: GASトークン取得
    const tokenRes = await fetch(`${GAS_URL}?action=token`, { redirect: 'follow' });
    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch {
      return NextResponse.json({ success: false, error: 'トークン取得失敗' }, { status: 500 });
    }
    if (!tokenData.success || !tokenData.token) {
      return NextResponse.json({ success: false, error: 'トークン取得失敗' }, { status: 500 });
    }
    const token = tokenData.token;

    // ⑥ 1件ずつリネーム実行（失敗スキップ続行）
    const renamed: PlanItem[] = [];
    const failed: Array<PlanItem & { error: string }> = [];

    for (const t of targets) {
      try {
        // Drive API: ファイル名更新
        const patchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(t.fileId)}?supportsAllDrives=true`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: t.newName }),
          }
        );

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          failed.push({ ...t, error: `Drive API ${patchRes.status}: ${errText.substring(0, 200)}` });
          continue;
        }

        // DB更新: old_filename と generated_filename
        const { error: updateErr } = await supabase
          .from('expense_receipts')
          .update({
            old_filename: t.oldName,
            generated_filename: t.newName,
          })
          .eq('id', t.receiptId);

        if (updateErr) {
          // Drive側は成功したがDB失敗 → 警告として記録（Drive側は新名のまま）
          failed.push({ ...t, error: `DB更新失敗（Drive側は新名に変更済）: ${updateErr.message}` });
          continue;
        }

        renamed.push(t);
      } catch (err) {
        failed.push({
          ...t,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      mode: 'execute',
      total: receipts.length,
      targets,
      skipped,
      renamed,
      failed,
    });

  } catch (error) {
    console.error('Rename receipts error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
