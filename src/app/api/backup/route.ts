import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxTJC1o9bj--xU_cae3bGpz62-QzqjpfPuBOVAxXF7Y0nk2BLXAYmrPqma5i25JQ9to/exec';
const COMPANY_FOLDER_ID = '1RkUALh9_Zl8Yz7_gXMfYNMPnnh7NSo5R'; // 00_会社

const TABLES = [
  'transactions',
  'transaction_allocations',
  'projects',
  'assets',
  'anbun_settings',
  'transport_details',
  'profiles',
  'revenue_types',
  'revenue_type_divisions',
  'contract_types',
  'clients',
  'recurring_expenses',
] as const;

// ── 共通: バックアップJSON生成 ──
async function generateBackupJson(): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const backup: Record<string, any[]> = {};

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`Backup error for ${table}:`, error);
      backup[table] = [];
    } else {
      backup[table] = data || [];
    }
  }

  return JSON.stringify({
    exported_at: new Date().toISOString(),
    tables: backup,
    table_counts: Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length])),
  }, null, 2);
}

// ── Drive フォルダ取得 or 作成 ──
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

// ── GET: ローカルダウンロード ──
export async function GET() {
  try {
    const json = await generateBackupJson();
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="komu10-backup-${now}.json"`,
      },
    });
  } catch (err) {
    console.error('Backup error:', err);
    return NextResponse.json({ error: 'バックアップに失敗しました' }, { status: 500 });
  }
}

// ── POST: Google Driveに保存 ──
export async function POST() {
  try {
    // 1. バックアップJSON生成
    const json = await generateBackupJson();

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

    // 3. フォルダ作成: 00_会社 > 09_アプリ > backups
    const appFolderId = await getOrCreateFolder(token, COMPANY_FOLDER_ID, '09_アプリ');
    const backupsFolderId = await getOrCreateFolder(token, appFolderId, 'backups');

    // 4. Drive APIでJSONファイルをアップロード
    const now = new Date().toISOString().split('T')[0]; // 2026-03-16
    const fileName = `komu10-backup-${now}.json`;

    const boundary = '===backup-boundary===';
    const metadata = JSON.stringify({ name: fileName, parents: [backupsFolderId] });
    const base64Json = Buffer.from(json, 'utf-8').toString('base64');
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Json}\r\n--${boundary}--`;

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return NextResponse.json({ success: false, error: 'Drive保存失敗: ' + errText.substring(0, 300) }, { status: 500 });
    }
    const uploadData = await uploadRes.json();

    return NextResponse.json({
      success: true,
      fileId: uploadData.id,
      fileName: fileName,
      url: `https://drive.google.com/file/d/${uploadData.id}/view`,
    });

  } catch (err) {
    console.error('Drive backup error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
