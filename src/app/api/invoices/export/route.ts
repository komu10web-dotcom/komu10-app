import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GAS_URL = process.env.DEFAULT_GAS_API_URL || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const INVOICE_ROOT_FOLDER_ID = process.env.INVOICE_DRIVE_FOLDER_ID || '';

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

    const { data: client } = await supabase
      .from('clients').select('*').eq('id', invoice.client_id).single();

    const { data: profile } = await supabase
      .from('profiles').select('business_name, postal_code, address, phone, email')
      .eq('user_key', invoice.owner).single();

    const bankAccount = invoice.bank_account_id
      ? (await supabase.from('bank_accounts').select('*').eq('id', invoice.bank_account_id).single()).data
      : null;

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

    const ownerFolder = invoice.owner === 'toshiki' ? '02_トシキ' : '01_トモ';
    const year = new Date(invoice.issue_date).getFullYear().toString();
    const clientFolder = client ? `${client.client_number}_${client.name}` : 'unknown';

    let folderId = INVOICE_ROOT_FOLDER_ID;
    if (folderId) {
      folderId = await getOrCreateFolder(token, folderId, ownerFolder);
      folderId = await getOrCreateFolder(token, folderId, year);
      folderId = await getOrCreateFolder(token, folderId, clientFolder);
    }

    const issueDate = invoice.issue_date;
    const yyyymm = issueDate.replace(/-/g, '').substring(0, 6);
    const sheetTitle = `${yyyymm}_${client?.name || 'unknown'}_請求書`;

    const spreadsheet = await createInvoiceSpreadsheet(
      token, sheetTitle, invoice, items || [], client, profile, bankAccount, folderId
    );

    if (!spreadsheet.spreadsheetId) {
      return NextResponse.json({ success: false, error: 'スプレッドシート作成失敗' }, { status: 500 });
    }

    const pdfBlob = await exportSpreadsheetAsPdf(token, spreadsheet.spreadsheetId);
    const pdfFileName = `${yyyymm}_${client?.name || 'unknown'}_請求書.pdf`;
    const pdfFileId = await uploadPdfToDrive(token, pdfBlob, pdfFileName, folderId);

    await supabase.from('invoices').update({
      drive_folder_id: folderId || null,
      drive_file_id: spreadsheet.spreadsheetId,
      pdf_url: `https://drive.google.com/file/d/${pdfFileId}/view`,
    }).eq('id', invoiceId);

    return NextResponse.json({
      success: true,
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
      pdfFileId,
      pdfUrl: `https://drive.google.com/file/d/${pdfFileId}/view`,
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
// ヘルパー
// ============================================================

async function getOrCreateFolder(token: string, parentId: string, folderName: string): Promise<string> {
  const q = encodeURIComponent(`'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = await createRes.json();
  return createData.id;
}

function fmtDate(d: string): string {
  const p = d.split('-');
  return `${p[0]}年${parseInt(p[1])}月${parseInt(p[2])}日`;
}

function rgb(hex: string) {
  const h = hex.replace('#', '');
  return { red: parseInt(h.substring(0, 2), 16) / 255, green: parseInt(h.substring(2, 4), 16) / 255, blue: parseInt(h.substring(4, 6), 16) / 255 };
}

const C = {
  charcoal: rgb('434343'), midGray: rgb('666666'), white: rgb('FFFFFF'),
  navy: rgb('1E3A5F'), navy10: rgb('E3E9F0'), gold: rgb('D4A03A'),
  logo: rgb('0A0A0B'), gray99: rgb('999999'),
};

function tf(font: string, size: number, bold: boolean, color: any) {
  return { fontFamily: font, fontSize: size, bold, foregroundColor: color };
}

function bdr(style: string, color: any) {
  return { style, color };
}

// ============================================================
// スプレッドシート作成（決定版xlsxレイアウト完全再現）
// ============================================================

async function createInvoiceSpreadsheet(
  token: string, title: string, invoice: any, items: any[],
  client: any, profile: any, bankAccount: any, folderId: string,
): Promise<{ spreadsheetId: string }> {

  const itemCount = Math.max(items.length, 5);
  const totalRows = 49 + Math.max(0, items.length - 5);

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title, locale: 'ja_JP' },
      sheets: [{ properties: { title: '請求書', gridProperties: { rowCount: totalRows, columnCount: 8 } } }],
    }),
  });
  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const sid = created.sheets[0].properties.sheetId;

  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`, {
      method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  // ================================================================
  // セルデータ（8列 A-H、xlsxのセル配置を完全再現）
  // ================================================================
  const R: any[][] = [];

  R.push(['', '', '', '', '', '', '', '']); // 1
  R.push(['', '請\u3000求\u3000書', '', '', '', '', ' komu10', '']); // 2
  R.push(['', '', '', '', '', '', '', '']); // 3
  R.push(['', '', '', '', '', '', '請求書番号：', invoice.invoice_number]); // 4
  R.push(['', '', '', '', '', '', '発行日：', fmtDate(invoice.issue_date)]); // 5
  R.push(['', '', '', '', '', '', '', '']); // 6 (Goldライン)
  R.push(['', '', '', '', '', '', '', '']); // 7
  R.push(['', '請求先', '', '', '', '', '請求元', '']); // 8

  const cName = client ? `${client.name}\u3000御中` : '';
  const bName = profile?.business_name || '';
  R.push(['', cName, '', '', '', '', bName, '']); // 9

  R.push(['', '', '', '', '', '', profile?.postal_code ? `〒${profile.postal_code}` : '', '']); // 10
  R.push(['', '件名', '', '', '', '', profile?.address || '', '']); // 11

  const subj = invoice.subject || '';
  R.push(['', subj, '', '', '', '', '', '']); // 12
  R.push(['', '', '', '', '', '', profile?.phone ? `TEL：${profile.phone}` : '', '']); // 13
  R.push(['', '', '', '', '', '', '', '']); // 14
  R.push(['', '下記のとおり御請求申し上げます。', '', '', '', '', '', '']); // 15
  R.push(['', '', '', '', '', '', '', '']); // 16
  R.push(['', 'ご請求金額（税込）', '', '', invoice.total, '', '', '']); // 17
  R.push(['', '', '', '', '', '', '', '']); // 18
  R.push(['', 'お支払期限', '', invoice.due_date ? fmtDate(invoice.due_date) : '', '', '', '', '']); // 19
  R.push(['', '', '', '', '', '', '', '']); // 20

  // 明細ヘッダー (row 21)
  const dhR = R.length;
  R.push(['', 'No.', '品名・摘要', '', '数量', '単位', '単価', '金額']);

  // 明細データ (row 22〜)
  const dsR = R.length;
  for (let i = 0; i < itemCount; i++) {
    const it = items[i];
    if (it) R.push(['', i + 1, it.description, '', it.quantity, it.unit || '式', it.unit_price, it.amount]);
    else R.push(['', '', '', '', '', '', '', '']);
  }
  const deR = R.length;

  // 小計 (row 27 or later)
  const stR = R.length;
  R.push(['', '小計', '', '', '', '', '', invoice.subtotal]);

  // 消費税
  const txR = R.length;
  R.push(['', '※免税事業者のため消費税の記載はございません', '', '', '', '', '消費税', '—']);

  // 合計
  const ttR = R.length;
  R.push(['', '合計（税込）', '', '', '', '', '', invoice.total]);

  R.push(['', '', '', '', '', '', '', '']); // 空行
  R.push(['', '', '', '', '', '', '', '']); // 空行

  // 振込先
  const bsR = R.length;
  if (bankAccount) {
    R.push(['', 'お振込先', '', 'いつもお世話になっております。下記までお振込をお願いいたします。', '', '', '', '']);
    const bi = bankAccount.bank_name + (bankAccount.bank_code ? `\u3000（金融機関コード：${bankAccount.bank_code}）` : '');
    R.push(['', '金融機関', '', bi, '', '', '', '']);
    const br = (bankAccount.branch_name || '') + (bankAccount.branch_code ? `\u3000（支店コード： ${bankAccount.branch_code}）` : '');
    R.push(['', '支店', '', br, '', '', '', '']);
    const atm: Record<string, string> = { ordinary: '普通', checking: '当座', savings: '貯蓄' };
    R.push(['', '口座種別', '', atm[bankAccount.account_type] || '普通', '', '', '', '']);
    R.push(['', '口座番号', '', bankAccount.account_number || bankAccount.account_number_last4 || '', '', '', '', '']);
    R.push(['', '口座名義', '', bankAccount.account_holder || bankAccount.name || '', '', '', '', '']);
  } else {
    for (let i = 0; i < 6; i++) R.push(['', '', '', '', '', '', '', '']);
  }

  R.push(['', '', '', '', '', '', '', '']); // 空行
  R.push(['', '', '', '', '', '', '', '']); // 空行

  const ptR = R.length;
  R.push(['', 'お支払条件', '', invoice.payment_terms || '契約書記載の支払条件に準ずる', '', '', '', '']);

  R.push(['', '', '', '', '', '', '', '']); // 空行
  R.push(['', '', '', '', '', '', '', '']); // 空行

  const nlR = R.length;
  R.push(['', '備考', '', '', '', '', '', '']);

  const notes = invoice.notes ? invoice.notes.split('\n') : [];
  const defaultNotes = [
    '本請求書は、業務委託契約に基づく月額固定報酬の請求です。',
    'インボイス制度における適格請求書発行事業者の登録番号はございません（免税事業者）。',
    '恐れ入りますが、お振込手数料は御社にてご負担ください。',
  ];
  for (let i = 0; i < 3; i++) R.push(['', notes[i] || defaultNotes[i] || '', '', '', '', '', '', '']);

  R.push(['', '', '', '', '', '', '', '']);
  R.push(['', '', '', '', '', '', '', '']);

  const ftR = R.length;
  R.push(['', 'Tourism Design duo', '', '', '', '', '', 'https://komu10.jp/']);

  // ================================================================
  // データ書き込み
  // ================================================================
  const range = `請求書!A1:H${R.length}`;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, values: R }),
  });

  // ================================================================
  // 書式 batchUpdate
  // ================================================================
  const q: any[] = [];

  // 列幅
  [22, 40, 48, 247, 73, 50, 103, 116].forEach((w, i) => {
    q.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' } });
  });

  // 行高
  const rh: Record<number, number> = { 0: 14, 1: 27, 8: 17, 16: 30, [dhR]: 17 };
  for (let i = dsR; i < deR; i++) rh[i] = 22;
  [stR, txR].forEach(r => rh[r] = 15);
  rh[ttR] = 17;
  rh[ftR] = 16;
  Object.entries(rh).forEach(([r, h]) => {
    q.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: Number(r), endIndex: Number(r) + 1 }, properties: { pixelSize: h }, fields: 'pixelSize' } });
  });

  // 全体デフォルト: Noto Sans 11pt Charcoal 白背景
  q.push({ repeatCell: {
    range: { sheetId: sid, startRowIndex: 0, endRowIndex: R.length, startColumnIndex: 0, endColumnIndex: 8 },
    cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 11, false, C.charcoal), backgroundColor: C.white } },
    fields: 'userEnteredFormat(textFormat,backgroundColor)',
  }});

  // グリッド線非表示
  q.push({ updateSheetProperties: { properties: { sheetId: sid, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } });

  // Row 2: タイトル B2:D2 + ロゴ G2:H2
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 22, true, C.charcoal), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 6, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Questrial', 23, true, C.logo), horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 6, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });

  // Row 4-5: 番号・日付 (G=9pt MidGray right, H=10pt Charcoal)
  [3, 4].forEach(r => {
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)' } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal) } }, fields: 'userEnteredFormat(textFormat)' } });
  });

  // Row 6: Gold accent line
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 8 }, cell: { userEnteredFormat: { borders: { bottom: bdr('SOLID', C.gold) } } }, fields: 'userEnteredFormat(borders)' } });

  // Row 8: ラベル
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray) } }, fields: 'userEnteredFormat(textFormat)' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray) } }, fields: 'userEnteredFormat(textFormat)' } });

  // Row 9: 宛名 B9:D9 + 請求元 G9:H9
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 12, true, C.charcoal) } }, fields: 'userEnteredFormat(textFormat)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  for (let r = 8; r <= 12; r++) {
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 6, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal) } }, fields: 'userEnteredFormat(textFormat)' } });
    q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 6, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });
  }

  // Row 11: 件名ラベル
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray) } }, fields: 'userEnteredFormat(textFormat)' } });

  // Row 12: 件名 B12:D12
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });

  // Row 15: B15:G15
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });

  // Row 17: 請求金額帯 Navy10%
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 4 }, cell: { userEnteredFormat: { backgroundColor: C.navy10 } }, fields: 'userEnteredFormat(backgroundColor)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 4, endColumnIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: C.navy10, textFormat: tf('Noto Sans', 16, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', numberFormat: { type: 'NUMBER', pattern: '\\¥#,##0' } } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,numberFormat)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 4, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });

  // Row 19: お支払期限
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.midGray), borders: { bottom: bdr('SOLID', C.midGray) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'CENTER', borders: { bottom: bdr('SOLID', C.midGray) } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,borders)' } });

  // 明細ヘッダー Row 21: Navy背景 白文字
  const hbT = bdr('SOLID_MEDIUM', C.midGray);
  const hbB = bdr('SOLID', C.midGray);
  const hbI = bdr('HAIR', C.gray99);
  const hbL = bdr('SOLID_MEDIUM', C.midGray);
  const hbR = bdr('SOLID_MEDIUM', C.midGray);
  const hbTL = bdr('SOLID', C.midGray);

  const hdrFmt = (left: any, right: any) => ({
    backgroundColor: C.navy, textFormat: tf('Noto Sans', 9, false, C.white),
    horizontalAlignment: 'CENTER', verticalAlignment: 'CENTER',
    borders: { top: hbT, bottom: hbB, left, right },
  });

  // B21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: hdrFmt(hbL, hbI) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  // C21:D21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: hdrFmt(hbI, hbI) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
  // E21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: hdrFmt(hbI, hbI) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  // F21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: hdrFmt(hbI, hbI) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  // G21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: hdrFmt(hbI, hbI) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  // H21
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: dhR, endRowIndex: dhR + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: hdrFmt(hbTL, hbR) }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)' } });

  // 明細データ行
  for (let r = dsR; r < deR; r++) {
    const last = r === deR - 1;
    const bb = last ? bdr('SOLID_MEDIUM', C.midGray) : bdr('HAIR', C.gray99);
    const cellFmt = (ha: string, nf: string | null, bl: any, br: any) => ({
      textFormat: tf('Noto Sans', 10, false, C.charcoal),
      horizontalAlignment: ha, verticalAlignment: 'CENTER',
      ...(nf ? { numberFormat: { type: 'NUMBER', pattern: nf } } : {}),
      borders: { bottom: bb, left: bl, right: br },
    });
    const flds = (nf: boolean) => `userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders${nf ? ',numberFormat' : ''})`;

    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: cellFmt('CENTER', '0', hbL, hbI) }, fields: flds(true) } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: cellFmt('LEFT', null, hbI, hbI) }, fields: flds(false) } });
    q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: cellFmt('CENTER', '0', hbI, hbI) }, fields: flds(true) } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: cellFmt('CENTER', null, hbI, hbI) }, fields: flds(false) } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: cellFmt('RIGHT', '#,##0', hbI, hbI) }, fields: flds(true) } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: cellFmt('RIGHT', '#,##0', hbTL, hbR) }, fields: flds(true) } });
  }

  // 小計行 B:G merge right, H ¥#,##0
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: stR, endRowIndex: stR + 1, startColumnIndex: 1, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', borders: { top: hbT, bottom: hbI, left: hbL, right: hbI } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: stR, endRowIndex: stR + 1, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: stR, endRowIndex: stR + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', numberFormat: { type: 'NUMBER', pattern: '\\¥#,##0' }, borders: { top: hbT, bottom: hbI, left: hbTL, right: hbR } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,numberFormat,borders)' } });

  // 消費税行
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: txR, endRowIndex: txR + 1, startColumnIndex: 1, endColumnIndex: 6 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.charcoal), horizontalAlignment: 'LEFT', verticalAlignment: 'CENTER', borders: { top: hbI, left: hbL } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: txR, endRowIndex: txR + 1, startColumnIndex: 1, endColumnIndex: 6 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: txR, endRowIndex: txR + 1, startColumnIndex: 6, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', borders: { top: hbI } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: txR, endRowIndex: txR + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', borders: { top: hbI, left: hbTL, right: hbR } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)' } });

  // 合計行
  const tb = bdr('SOLID_MEDIUM', C.midGray);
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ttR, endRowIndex: ttR + 1, startColumnIndex: 1, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', borders: { top: tb, bottom: tb, left: tb, right: hbI } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: ttR, endRowIndex: ttR + 1, startColumnIndex: 1, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ttR, endRowIndex: ttR + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 12, false, C.charcoal), horizontalAlignment: 'RIGHT', verticalAlignment: 'CENTER', numberFormat: { type: 'NUMBER', pattern: '\\¥#,##0' }, borders: { top: tb, bottom: tb, left: hbTL, right: tb } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,numberFormat,borders)' } });

  // 振込先セクション
  if (bankAccount) {
    // ラベル行 + bottom border
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: bsR, endRowIndex: bsR + 1, startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray), borders: { bottom: bdr('SOLID', C.gray99) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });
    q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: bsR, endRowIndex: bsR + 1, startColumnIndex: 3, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.charcoal), borders: { bottom: bdr('SOLID', C.gray99) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });
    q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: bsR, endRowIndex: bsR + 1, startColumnIndex: 3, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });

    for (let i = 1; i <= 5; i++) {
      const r = bsR + i;
      q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray) } }, fields: 'userEnteredFormat(textFormat)' } });
      q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
      q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 3, endColumnIndex: 7 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal) } }, fields: 'userEnteredFormat(textFormat)' } });
      q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 3, endColumnIndex: 7 }, mergeType: 'MERGE_ALL' } });
    }
  }

  // お支払条件
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ptR, endRowIndex: ptR + 1, startColumnIndex: 1, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray), borders: { bottom: bdr('SOLID', C.gray99) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });
  q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: ptR, endRowIndex: ptR + 1, startColumnIndex: 1, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ptR, endRowIndex: ptR + 1, startColumnIndex: 3, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 10, false, C.charcoal), borders: { bottom: bdr('SOLID', C.gray99) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });

  // 備考ラベル + bottom border
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: nlR, endRowIndex: nlR + 1, startColumnIndex: 1, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.midGray), borders: { bottom: bdr('SOLID', C.gray99) } } }, fields: 'userEnteredFormat(textFormat,borders)' } });

  // 備考本文 B:H merge 9pt
  for (let i = 1; i <= 3; i++) {
    const r = nlR + i;
    if (r < R.length) {
      q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Noto Sans', 9, false, C.charcoal) } }, fields: 'userEnteredFormat(textFormat)' } });
      q.push({ mergeCells: { range: { sheetId: sid, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });
    }
  }

  // フッター
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ftR, endRowIndex: ftR + 1, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: tf('Questrial', 8, false, C.gray99), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment)' } });
  q.push({ repeatCell: { range: { sheetId: sid, startRowIndex: ftR, endRowIndex: ftR + 1, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { textFormat: tf('Questrial', 8, false, C.gray99), horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment)' } });

  // batchUpdate
  if (q.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: q }),
    });
  }

  return { spreadsheetId };
}

async function exportSpreadsheetAsPdf(token: string, spreadsheetId: string): Promise<ArrayBuffer> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&top_margin=0.6&bottom_margin=0.4&left_margin=0.6&right_margin=0.4`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
  return res.arrayBuffer();
}

async function uploadPdfToDrive(token: string, pdfData: ArrayBuffer, fileName: string, folderId: string): Promise<string> {
  const boundary = '===invoice-pdf-boundary===';
  const metadata = JSON.stringify({ name: fileName, mimeType: 'application/pdf', parents: folderId ? [folderId] : undefined });
  const uint8 = new Uint8Array(pdfData);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) throw new Error(`PDF upload failed: ${uploadRes.status}`);
  return (await uploadRes.json()).id;
}
