import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GAS_URL = process.env.DEFAULT_GAS_API_URL || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 請求書Driveフォルダ（00_会社 > 03_請求書）
const INVOICE_ROOT_FOLDER_ID = process.env.INVOICE_DRIVE_FOLDER_ID || '';

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: '請求書IDが必要です' }, { status: 400 });
    }

    // 1. Supabaseから請求書データ取得
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

    // 2. GASからOAuthトークン取得
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

    // 3. Driveフォルダ構造を作成
    // 03_請求書/{01_トモ or 02_トシキ}/{年度}/{取引先番号}_{取引先名}/
    const ownerFolder = invoice.owner === 'toshiki' ? '02_トシキ' : '01_トモ';
    const year = new Date(invoice.issue_date).getFullYear().toString();
    const clientFolder = client
      ? `${client.client_number}_${client.name}`
      : 'unknown';

    let folderId = INVOICE_ROOT_FOLDER_ID;
    if (folderId) {
      folderId = await getOrCreateFolder(token, folderId, ownerFolder);
      folderId = await getOrCreateFolder(token, folderId, year);
      folderId = await getOrCreateFolder(token, folderId, clientFolder);
    }

    // 4. Googleスプレッドシート作成
    const issueDate = invoice.issue_date;
    const yyyymm = issueDate.replace(/-/g, '').substring(0, 6);
    const sheetTitle = `${yyyymm}_${client?.name || 'unknown'}_請求書`;

    const spreadsheet = await createInvoiceSpreadsheet(
      token, sheetTitle, invoice, items || [], client, profile, bankAccount, folderId
    );

    if (!spreadsheet.spreadsheetId) {
      return NextResponse.json({ success: false, error: 'スプレッドシート作成失敗' }, { status: 500 });
    }

    // 5. スプレッドシートをPDFエクスポート
    const pdfBlob = await exportSpreadsheetAsPdf(token, spreadsheet.spreadsheetId);

    // 6. PDFをDriveにアップロード
    const pdfFileName = `${yyyymm}_${client?.name || 'unknown'}_請求書.pdf`;
    const pdfFileId = await uploadPdfToDrive(token, pdfBlob, pdfFileName, folderId);

    // 7. invoicesテーブル更新
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
// ヘルパー関数
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

function formatDate(d: string): string {
  const parts = d.split('-');
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
}

async function createInvoiceSpreadsheet(
  token: string,
  title: string,
  invoice: any,
  items: any[],
  client: any,
  profile: any,
  bankAccount: any,
  folderId: string,
): Promise<{ spreadsheetId: string }> {

  // スプレッドシート作成（Sheets API）
  const sheetData = {
    properties: { title, locale: 'ja_JP' },
    sheets: [{
      properties: {
        title: '請求書',
        gridProperties: { rowCount: 50, columnCount: 6 },
      },
    }],
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(sheetData),
  });
  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const sheetId = created.sheets[0].properties.sheetId;

  // フォルダに移動
  if (folderId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  // データ書き込み
  const rows: any[][] = [];

  // ヘッダー
  rows.push(['', '', '', '', '', '']);
  rows.push(['', '請　求　書', '', '', '', '']);
  rows.push(['', '', '', '', '', '']);

  // 宛先 & 請求元
  rows.push([`${client?.name || ''} 御中`, '', '', '', invoice.invoice_number, '']);
  if (client?.address) {
    rows.push([`${client?.postal_code ? '〒' + client.postal_code + ' ' : ''}${client.address}`, '', '', '', formatDate(invoice.issue_date), '']);
  } else {
    rows.push(['', '', '', '', formatDate(invoice.issue_date), '']);
  }

  // 請求元情報
  rows.push(['', '', '', '', profile?.business_name || '', '']);
  if (profile?.address) {
    rows.push(['', '', '', '', `${profile?.postal_code ? '〒' + profile.postal_code + ' ' : ''}${profile.address}`, '']);
  } else {
    rows.push(['', '', '', '', '', '']);
  }
  if (profile?.phone) {
    rows.push(['', '', '', '', `TEL ${profile.phone}`, '']);
  } else {
    rows.push(['', '', '', '', '', '']);
  }
  if (profile?.email) {
    rows.push(['', '', '', '', profile.email, '']);
  } else {
    rows.push(['', '', '', '', '', '']);
  }

  rows.push(['', '', '', '', '', '']);

  // 対象期間
  if (invoice.period_start || invoice.period_end) {
    rows.push([`対象期間: ${invoice.period_start ? formatDate(invoice.period_start) : ''} 〜 ${invoice.period_end ? formatDate(invoice.period_end) : ''}`, '', '', '', '', '']);
  } else {
    rows.push(['', '', '', '', '', '']);
  }

  // 合計金額
  rows.push([`ご請求金額: ¥${invoice.total.toLocaleString()}`, '', '', '', '', '']);
  rows.push(['', '', '', '', '', '']);

  // 明細ヘッダー
  const detailStartRow = rows.length;
  rows.push(['品名', '', '数量', '単価', '金額', '']);

  // 明細行
  for (const item of items) {
    rows.push([item.description, '', item.quantity, item.unit_price, item.amount, '']);
  }

  // 空行で明細を最低5行に
  const minRows = 5;
  for (let i = items.length; i < minRows; i++) {
    rows.push(['', '', '', '', '', '']);
  }

  rows.push(['', '', '', '', '', '']);

  // 小計・税・合計
  rows.push(['', '', '', '小計', invoice.subtotal, '']);
  rows.push(['', '', '', '消費税', invoice.tax_amount > 0 ? invoice.tax_amount : '—', '']);
  rows.push(['', '', '', '合計', invoice.total, '']);

  rows.push(['', '', '', '', '', '']);

  // 振込先
  if (bankAccount) {
    rows.push(['お振込先', '', '', '', '', '']);
    rows.push([`${bankAccount.bank_name} ${bankAccount.branch_name || ''}`, '', '', '', '', '']);
    rows.push([`${bankAccount.account_type} ${bankAccount.account_number_last4 ? '****' + bankAccount.account_number_last4 : ''} / ${bankAccount.name}`, '', '', '', '', '']);
  }

  // 備考
  if (invoice.notes) {
    rows.push(['', '', '', '', '', '']);
    rows.push(['備考', '', '', '', '', '']);
    rows.push([invoice.notes, '', '', '', '', '']);
  }

  // データ書き込み
  const range = `請求書!A1:F${rows.length}`;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, values: rows }),
  });

  // セル書式設定（バッチ更新）
  const requests: any[] = [];

  // 列幅設定
  const colWidths = [250, 50, 80, 100, 120, 30];
  colWidths.forEach((width, idx) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  // タイトル行 (row 1) — 中央揃え、太字、大きめフォント
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 },
      cell: {
        userEnteredFormat: {
          horizontalAlignment: 'CENTER',
          textFormat: { bold: true, fontSize: 16 },
        },
      },
      fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
    },
  });

  // セルマージ：タイトル行
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 6 },
      mergeType: 'MERGE_ALL',
    },
  });

  // 明細ヘッダー行 — 太字、下線
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: detailStartRow, endRowIndex: detailStartRow + 1, startColumnIndex: 0, endColumnIndex: 6 },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 10 },
          borders: { bottom: { style: 'SOLID', width: 2, color: { red: 0.1, green: 0.1, blue: 0.1 } } },
        },
      },
      fields: 'userEnteredFormat(textFormat,borders)',
    },
  });

  // 金額列（E列）に数値書式
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: detailStartRow + 1, endRowIndex: rows.length, startColumnIndex: 4, endColumnIndex: 5 },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'NUMBER', pattern: '#,##0' },
          horizontalAlignment: 'RIGHT',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // 単価列（D列）に数値書式
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: detailStartRow + 1, endRowIndex: rows.length, startColumnIndex: 3, endColumnIndex: 4 },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'NUMBER', pattern: '#,##0' },
          horizontalAlignment: 'RIGHT',
        },
      },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  });

  // 数量列（C列）中央揃え
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: detailStartRow + 1, endRowIndex: rows.length, startColumnIndex: 2, endColumnIndex: 3 },
      cell: {
        userEnteredFormat: { horizontalAlignment: 'CENTER' },
      },
      fields: 'userEnteredFormat(horizontalAlignment)',
    },
  });

  if (requests.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
  }

  return { spreadsheetId };
}

async function exportSpreadsheetAsPdf(token: string, spreadsheetId: string): Promise<ArrayBuffer> {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&size=A4&portrait=true&fitw=true&gridlines=false`;
  const res = await fetch(exportUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`PDF export failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

async function uploadPdfToDrive(token: string, pdfData: ArrayBuffer, fileName: string, folderId: string): Promise<string> {
  const boundary = '===invoice-pdf-boundary===';
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: 'application/pdf',
    parents: folderId ? [folderId] : undefined,
  });

  // ArrayBufferをBase64に変換
  const uint8 = new Uint8Array(pdfData);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);

  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!uploadRes.ok) {
    throw new Error(`PDF upload failed: ${uploadRes.status}`);
  }
  const uploadData = await uploadRes.json();
  return uploadData.id;
}
