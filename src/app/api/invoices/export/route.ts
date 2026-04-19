import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// v0.5.7: テンプレスプシをコピーして値を流し込む方式に全面刷新
// - 旧方式: スプシをゼロから組み立てる（500行）
// - 新方式: テンプレコピー → 指定セルに値流し込み → 指定フォルダに配置
// ============================================================

const GAS_URL = process.env.DEFAULT_GAS_API_URL || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INVOICE_ROOT_FOLDER_ID = process.env.INVOICE_DRIVE_FOLDER_ID || '';
const TEMPLATE_SPREADSHEET_ID = process.env.INVOICE_TEMPLATE_SPREADSHEET_ID || '';

const MAX_ITEMS = 5;

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: '請求書IDが必要です' }, { status: 400 });
    }

    if (!TEMPLATE_SPREADSHEET_ID) {
      return NextResponse.json({
        success: false,
        error: 'テンプレスプシIDが未設定です（Vercel環境変数 INVOICE_TEMPLATE_SPREADSHEET_ID を設定してください）',
      }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: invoice, error: invErr } = await supabase
      .from('invoices').select('*').eq('id', invoiceId).single();
    if (invErr || !invoice) {
      return NextResponse.json({ success: false, error: '請求書が見つかりません' }, { status: 404 });
    }

    const { data: items } = await supabase
      .from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order');

    const itemList = items || [];
    if (itemList.length > MAX_ITEMS) {
      return NextResponse.json({
        success: false,
        error: `明細が${itemList.length}行あります。テンプレは${MAX_ITEMS}行まで対応。請求書を分割するか明細を統合してください。`,
      }, { status: 400 });
    }

    const { data: client } = await supabase
      .from('clients').select('*').eq('id', invoice.client_id).single();

    const bankAccount = invoice.bank_account_id
      ? (await supabase.from('bank_accounts').select('*').eq('id', invoice.bank_account_id).single()).data
      : null;

    // GASトークン取得
    const tokenRes = await fetch(`${GAS_URL}?action=token`, { redirect: 'follow' });
    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch {
      return NextResponse.json({ success: false, error: 'トークン取得失敗（GAS応答不正）' }, { status: 500 });
    }
    if (!tokenData.success || !tokenData.token) {
      return NextResponse.json({ success: false, error: 'トークン取得失敗' }, { status: 500 });
    }
    const token = tokenData.token;

    // 保存先フォルダ作成
    const ownerFolder = invoice.owner === 'toshiki' ? '02_トシキ' : '01_トモ';
    const year = new Date(invoice.issue_date).getFullYear().toString();
    const clientFolder = client ? `${client.client_number}_${client.name}` : 'unknown';

    let folderId = INVOICE_ROOT_FOLDER_ID;
    if (folderId) {
      folderId = await getOrCreateFolder(token, folderId, ownerFolder);
      folderId = await getOrCreateFolder(token, folderId, year);
      folderId = await getOrCreateFolder(token, folderId, clientFolder);
    }

    const yyyymm = invoice.issue_date.replace(/-/g, '').substring(0, 6);
    const fileName = `${yyyymm}_${client?.name || 'unknown'}_請求書`;

    // テンプレコピー
    const spreadsheetId = await copyTemplate(token, TEMPLATE_SPREADSHEET_ID, fileName, folderId);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: 'テンプレのコピーに失敗しました' }, { status: 500 });
    }

    // 値流し込み
    await fillInvoiceData(token, spreadsheetId, invoice, itemList, client, bankAccount);

    // DB更新
    await supabase.from('invoices').update({
      drive_folder_id: folderId || null,
      drive_file_id: spreadsheetId,
      pdf_url: null,
    }).eq('id', invoiceId);

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });

  } catch (error) {
    console.error('Invoice export error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// ============================================================
async function getOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId],
    }),
  });
  const created = await createRes.json();
  return created.id;
}

async function copyTemplate(token: string, templateId: string, fileName: string, folderId: string): Promise<string | null> {
  const body: any = { name: fileName };
  if (folderId) body.parents = [folderId];

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`テンプレコピー失敗 (status=${res.status}): ${errText.substring(0, 300)}`);
  }
  const data = await res.json();
  return data.id || null;
}

async function fillInvoiceData(
  token: string, spreadsheetId: string,
  invoice: any, items: any[], client: any, bankAccount: any,
): Promise<void> {

  const atm: Record<string, string> = { ordinary: '普通', savings: '普通', checking: '当座' };

  const bankLine = bankAccount ? (() => {
    const hasCode = bankAccount.bank_code && (bankAccount.bank_name || '').includes(`（${bankAccount.bank_code}）`);
    return bankAccount.bank_name + (bankAccount.bank_code && !hasCode ? `　（金融機関コード：${bankAccount.bank_code}）` : '');
  })() : '';

  const branchLine = bankAccount ? (() => {
    const hasCode = bankAccount.branch_code && (bankAccount.branch_name || '').includes(`（${bankAccount.branch_code}）`);
    return (bankAccount.branch_name || '') + (bankAccount.branch_code && !hasCode ? `　（支店コード： ${bankAccount.branch_code}）` : '');
  })() : '';

  const fmtDate = (d: string) => {
    if (!d) return '';
    const p = d.split('-');
    if (p.length !== 3) return d;
    return `${p[0]}年${parseInt(p[1])}月${parseInt(p[2])}日`;
  };

  const updates: Array<{ range: string; values: any[][] }> = [];

  updates.push({ range: '請求書!H4', values: [[invoice.invoice_no || '']] });
  updates.push({ range: '請求書!H5', values: [[fmtDate(invoice.issue_date)]] });
  updates.push({ range: '請求書!B9', values: [[`${client?.name || ''} 御中`]] });
  updates.push({ range: '請求書!B12', values: [[invoice.subject || '']] });
  updates.push({ range: '請求書!D19', values: [[fmtDate(invoice.due_date)]] });

  // 明細5行（未使用行はクリア）
  for (let i = 0; i < MAX_ITEMS; i++) {
    const row = 22 + i;
    const it = items[i];
    if (it) {
      updates.push({ range: `請求書!B${row}`, values: [[i + 1]] });
      updates.push({ range: `請求書!C${row}`, values: [[it.description || '']] });
      updates.push({ range: `請求書!E${row}`, values: [[Number(it.quantity) || 0]] });
      updates.push({ range: `請求書!F${row}`, values: [[it.unit || '式']] });
      updates.push({ range: `請求書!G${row}`, values: [[Number(it.unit_price) || 0]] });
      updates.push({ range: `請求書!H${row}`, values: [[`=E${row}*G${row}`]] });
    } else {
      updates.push({ range: `請求書!B${row}:H${row}`, values: [['', '', '', '', '', '', '']] });
    }
  }

  // 振込先
  updates.push({ range: '請求書!D33', values: [[bankLine]] });
  updates.push({ range: '請求書!D34', values: [[branchLine]] });
  updates.push({ range: '請求書!D35', values: [[bankAccount ? (atm[bankAccount.account_type] || '普通') : '']] });
  updates.push({ range: '請求書!D36', values: [[bankAccount?.account_number || '']] });
  updates.push({ range: '請求書!D37', values: [[bankAccount?.account_holder_kana || bankAccount?.account_holder_name || bankAccount?.name || '']] });

  // お支払条件・動的備考
  updates.push({ range: '請求書!D40', values: [[invoice.payment_terms || '契約書記載の支払条件に準ずる']] });
  updates.push({ range: '請求書!B44', values: [[invoice.notes || '']] });

  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates,
    }),
  });
  if (!batchRes.ok) {
    const errText = await batchRes.text();
    throw new Error(`Sheets batchUpdate失敗 (status=${batchRes.status}): ${errText.substring(0, 300)}`);
  }
}
