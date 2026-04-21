import { NextRequest, NextResponse } from 'next/server';

const GAS_URL = process.env.DEFAULT_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbwiGFVxofGPnaPJnox_K7GeW01elk9ZGPoN0dWC9bi9hqoKdEmXbGtxQZjDRWw94oah/exec';
const PARENT_FOLDER_ID = '1Rcd2MWZLMA7bDax4MLh4ZjxokIU_NV2W';

/**
 * 領収書アップロードAPI（v0.11.0）
 * - 外部から命名規則適用済の generatedFilename を受け取る
 * - 同名ファイル存在時は (2)〜(99) で自動回避
 */
export async function POST(request: NextRequest) {
  try {
    const { image, filename, date, mimeType, owner, generatedFilename } = await request.json();
    if (!image || !filename) {
      return NextResponse.json({ success: false, error: '画像データとファイル名が必要です' }, { status: 400 });
    }

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

    const ownerFolder = owner === 'toshiki' ? 'toshiki' : 'tomo';
    const ownerFolderId = await getOrCreateFolder(token, PARENT_FOLDER_ID, ownerFolder);
    const dateStr = date || new Date().toISOString().split('T')[0];
    const yearMonth = dateStr.substring(0, 7);
    const folderId = await getOrCreateFolder(token, ownerFolderId, yearMonth);
    const folderPath = `${ownerFolder}/${yearMonth}`;

    let targetName: string;
    if (generatedFilename) {
      targetName = String(generatedFilename).replace(/[/\\:*?"<>|]/g, '_');
    } else {
      targetName = filename.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_').substring(0, 50);
    }

    const finalName = await resolveUniqueName(token, folderId, targetName);

    const boundary = '===boundary===';
    const metadata = JSON.stringify({ name: finalName, parents: [folderId] });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'image/jpeg'}\r\nContent-Transfer-Encoding: base64\r\n\r\n${image}\r\n--${boundary}--`;

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
      return NextResponse.json({ success: false, error: 'Drive upload failed: ' + errText.substring(0, 300) }, { status: 500 });
    }
    const uploadData = await uploadRes.json();

    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return NextResponse.json({
      success: true,
      url: `https://drive.google.com/file/d/${uploadData.id}/view`,
      fileId: uploadData.id,
      folder: folderPath,
      folderPath,
      fileName: finalName,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

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

async function resolveUniqueName(token: string, folderId: string, desiredName: string): Promise<string> {
  const exists = async (name: string): Promise<boolean> => {
    const safeName = name.replace(/'/g, "\\'");
    const q = encodeURIComponent(`'${folderId}' in parents and name='${safeName}' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    return !!(data.files && data.files.length > 0);
  };

  if (!(await exists(desiredName))) return desiredName;

  const dotIdx = desiredName.lastIndexOf('.');
  const base = dotIdx > 0 ? desiredName.substring(0, dotIdx) : desiredName;
  const ext = dotIdx > 0 ? desiredName.substring(dotIdx) : '';

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}(${i})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }

  return `${base}_${Date.now()}${ext}`;
}
