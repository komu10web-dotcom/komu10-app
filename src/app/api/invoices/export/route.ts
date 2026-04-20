import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateInvoiceAmounts, paymentTermsLabel, feeBurdenLabel } from '@/lib/invoiceCalc';
import type { WithholdingBasis, HeaderAmountType } from '@/types/database';

// ============================================================
// v0.6.0: 請求書管理v2 — 源泉徴収対応
// - テンプレA (源泉あり): INVOICE_TEMPLATE_A_SPREADSHEET_ID
// - テンプレB (源泉なし): INVOICE_TEMPLATE_B_SPREADSHEET_ID
// - 旧INVOICE_TEMPLATE_SPREADSHEET_ID はフォールバック
// - 金額は src/lib/invoiceCalc.ts で一括計算 → 値（数式ではなく）で流し込み
// ============================================================

const GAS_URL = process.env.DEFAULT_GAS_API_URL || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INVOICE_ROOT_FOLDER_ID = process.env.INVOICE_DRIVE_FOLDER_ID || '';
const TEMPLATE_A_ID = process.env.INVOICE_TEMPLATE_A_SPREADSHEET_ID || '';
const TEMPLATE_B_ID = process.env.INVOICE_TEMPLATE_B_SPREADSHEET_ID || '';
const TEMPLATE_LEGACY_ID = process.env.INVOICE_TEMPLATE_SPREADSHEET_ID || '';

const MAX_ITEMS = 5;

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: '請求書IDが必要です' }, { status: 400 });
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

    // v0.6.0: 源泉有無でテンプレ切替
    const withholdingTax = !!invoice.withholding_tax;
    const templateId = withholdingTax
      ? (TEMPLATE_A_ID || TEMPLATE_LEGACY_ID)
      : (TEMPLATE_B_ID || TEMPLATE_LEGACY_ID);

    if (!templateId) {
      return NextResponse.json({
        success: false,
        error: withholdingTax
          ? 'テンプレA（源泉あり）未設定です。Vercel環境変数 INVOICE_TEMPLATE_A_SPREADSHEET_ID を設定してください'
          : 'テンプレB（源泉なし）未設定です。Vercel環境変数 INVOICE_TEMPLATE_B_SPREADSHEET_ID を設定してください',
      }, { status: 500 });
    }

    // v0.6.0: サーバー側でも invoiceCalc で計算し直し（DB値との整合チェック）
    const calc = calculateInvoiceAmounts({
      subtotal: Number(invoice.subtotal) || 0,
      taxAmount: Number(invoice.tax_amount) || 0,
      withholdingTax,
      withholdingBasis: (invoice.withholding_basis || 'tax_included') as WithholdingBasis,
      headerAmountType: (invoice.header_amount_type || 'total') as HeaderAmountType,
    });
    if (
      Math.abs((Number(invoice.withholding_amount) || 0) - calc.withholdingAmount) > 0 ||
      Math.abs((Number(invoice.net_payment) || 0) - calc.netPayment) > 0
    ) {
      console.warn('[invoice-export] DB金額とcalc結果に差分あり', {
        invoiceId,
        db: { withholding_amount: invoice.withholding_amount, net_payment: invoice.net_payment },
        calc: { withholdingAmount: calc.withholdingAmount, netPayment: calc.netPayment },
      });
    }

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
    const spreadsheetId = await copyTemplate(token, templateId, fileName, folderId);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: 'テンプレのコピーに失敗しました' }, { status: 500 });
    }

    // 値流し込み（A/B分岐）
    if (withholdingTax) {
      await fillInvoiceDataA(token, spreadsheetId, invoice, itemList, client, bankAccount, calc);
    } else {
      await fillInvoiceDataB(token, spreadsheetId, invoice, itemList, client, bankAccount, calc);
    }

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
// 共通ユーティリティ
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

function buildBankLines(bankAccount: any) {
  const atm: Record<string, string> = { ordinary: '普通', savings: '普通', checking: '当座' };
  const bankLine = bankAccount ? (() => {
    const hasCode = bankAccount.bank_code && (bankAccount.bank_name || '').includes(`（${bankAccount.bank_code}）`);
    return bankAccount.bank_name + (bankAccount.bank_code && !hasCode ? `　（金融機関コード：${bankAccount.bank_code}）` : '');
  })() : '';
  const branchLine = bankAccount ? (() => {
    const hasCode = bankAccount.branch_code && (bankAccount.branch_name || '').includes(`（${bankAccount.branch_code}）`);
    return (bankAccount.branch_name || '') + (bankAccount.branch_code && !hasCode ? `　（支店コード： ${bankAccount.branch_code}）` : '');
  })() : '';
  const accountType = bankAccount ? (atm[bankAccount.account_type] || '普通') : '';
  const accountNumber = bankAccount?.account_number || '';
  const accountHolder = bankAccount?.account_holder_kana || bankAccount?.account_holder_name || bankAccount?.name || '';
  return { bankLine, branchLine, accountType, accountNumber, accountHolder };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const p = d.split('-');
  if (p.length !== 3) return d;
  return `${p[0]}年${parseInt(p[1])}月${parseInt(p[2])}日`;
}

// v0.6.3: 備考欄は (1)ユーザー備考 (2)インボイス免税注記 (3)振込手数料負担 の3要素で構成
const INVOICE_EXEMPT_NOTE =
  '本請求書は、2023年10月1日施行のインボイス制度における「適格請求書発行事業者以外の事業者」として発行するものです。';

function buildNotes(invoice: any): string {
  const base = (invoice.notes || '').trim();
  const fee = feeBurdenLabel(invoice.fee_burden);
  const parts = [base, INVOICE_EXEMPT_NOTE, fee].filter(Boolean);
  return parts.join('\n\n');
}

async function batchUpdate(
  token: string, spreadsheetId: string,
  updates: Array<{ range: string; values: any[][] }>,
): Promise<void> {
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

// ============================================================
// テンプレA: 源泉あり
// ============================================================
async function fillInvoiceDataA(
  token: string, spreadsheetId: string,
  invoice: any, items: any[], client: any, bankAccount: any,
  calc: ReturnType<typeof calculateInvoiceAmounts>,
): Promise<void> {
  const bank = buildBankLines(bankAccount);
  const updates: Array<{ range: string; values: any[][] }> = [];

  updates.push({ range: '請求書!H4', values: [[invoice.invoice_number || '']] });
  updates.push({ range: '請求書!H5', values: [[fmtDate(invoice.issue_date)]] });
  updates.push({ range: '請求書!B9', values: [[`${client?.name || ''} 御中`]] });
  updates.push({ range: '請求書!B12', values: [[invoice.subject || '']] });
  updates.push({ range: '請求書!D19', values: [[fmtDate(invoice.due_date)]] });

  for (let i = 0; i < MAX_ITEMS; i++) {
    const row = 22 + i;
    const it = items[i];
    if (it) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const amount = Math.round(qty * price);
      updates.push({ range: `請求書!B${row}`, values: [[i + 1]] });
      updates.push({ range: `請求書!C${row}`, values: [[it.description || '']] });
      updates.push({ range: `請求書!E${row}`, values: [[qty]] });
      updates.push({ range: `請求書!F${row}`, values: [[it.unit || '式']] });
      updates.push({ range: `請求書!G${row}`, values: [[price]] });
      updates.push({ range: `請求書!H${row}`, values: [[amount]] });
    } else {
      updates.push({ range: `請求書!B${row}:H${row}`, values: [['', '', '', '', '', '', '']] });
    }
  }

  updates.push({ range: '請求書!H27', values: [[calc.subtotal]] });
  updates.push({ range: '請求書!H29', values: [[-calc.withholdingAmount]] });
  updates.push({ range: '請求書!B30', values: [[calc.netPayment]] });
  updates.push({ range: '請求書!H30', values: [[calc.netPayment]] });
  updates.push({ range: '請求書!E17', values: [[calc.headerAmount]] });

  // 振込先 (A: D34〜D38)
  updates.push({ range: '請求書!D34', values: [[bank.bankLine]] });
  updates.push({ range: '請求書!D35', values: [[bank.branchLine]] });
  updates.push({ range: '請求書!D36', values: [[bank.accountType]] });
  updates.push({ range: '請求書!D37', values: [[bank.accountNumber]] });
  updates.push({ range: '請求書!D38', values: [[bank.accountHolder]] });

  updates.push({ range: '請求書!D41', values: [[paymentTermsLabel(client?.payment_terms_type) || invoice.payment_terms || '契約書記載の支払条件に準ずる']] });
  updates.push({ range: '請求書!B45', values: [[buildNotes(invoice)]] });

  await batchUpdate(token, spreadsheetId, updates);
}

// ============================================================
// テンプレB: 源泉なし（レイアウト1行シフト）
// ============================================================
async function fillInvoiceDataB(
  token: string, spreadsheetId: string,
  invoice: any, items: any[], client: any, bankAccount: any,
  calc: ReturnType<typeof calculateInvoiceAmounts>,
): Promise<void> {
  const bank = buildBankLines(bankAccount);
  const updates: Array<{ range: string; values: any[][] }> = [];

  updates.push({ range: '請求書!H4', values: [[invoice.invoice_number || '']] });
  updates.push({ range: '請求書!H5', values: [[fmtDate(invoice.issue_date)]] });
  updates.push({ range: '請求書!B9', values: [[`${client?.name || ''} 御中`]] });
  updates.push({ range: '請求書!B12', values: [[invoice.subject || '']] });
  updates.push({ range: '請求書!D19', values: [[fmtDate(invoice.due_date)]] });

  for (let i = 0; i < MAX_ITEMS; i++) {
    const row = 22 + i;
    const it = items[i];
    if (it) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const amount = Math.round(qty * price);
      updates.push({ range: `請求書!B${row}`, values: [[i + 1]] });
      updates.push({ range: `請求書!C${row}`, values: [[it.description || '']] });
      updates.push({ range: `請求書!E${row}`, values: [[qty]] });
      updates.push({ range: `請求書!F${row}`, values: [[it.unit || '式']] });
      updates.push({ range: `請求書!G${row}`, values: [[price]] });
      updates.push({ range: `請求書!H${row}`, values: [[amount]] });
    } else {
      updates.push({ range: `請求書!B${row}:H${row}`, values: [['', '', '', '', '', '', '']] });
    }
  }

  // 合計（免税のため subtotal = total）
  updates.push({ range: '請求書!B29', values: [[calc.total]] });
  updates.push({ range: '請求書!H29', values: [[calc.total]] });
  updates.push({ range: '請求書!E17', values: [[calc.headerAmount]] });

  // 振込先 (B: D33〜D37)
  updates.push({ range: '請求書!D33', values: [[bank.bankLine]] });
  updates.push({ range: '請求書!D34', values: [[bank.branchLine]] });
  updates.push({ range: '請求書!D35', values: [[bank.accountType]] });
  updates.push({ range: '請求書!D36', values: [[bank.accountNumber]] });
  updates.push({ range: '請求書!D37', values: [[bank.accountHolder]] });

  // お支払条件・備考 (B: D40 / B44)
  updates.push({ range: '請求書!D40', values: [[paymentTermsLabel(client?.payment_terms_type) || invoice.payment_terms || '契約書記載の支払条件に準ずる']] });
  updates.push({ range: '請求書!B44', values: [[buildNotes(invoice)]] });

  await batchUpdate(token, spreadsheetId, updates);
}
