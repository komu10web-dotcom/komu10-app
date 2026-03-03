import { NextRequest, NextResponse } from 'next/server';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxTJC1o9bj--xU_cae3bGpz62-QzqjpfPuBOVAxXF7Y0nk2BLXAYmrPqma5i25JQ9to/exec';
const PARENT_FOLDER_ID = '1Rcd2MWZLMA7bDax4MLh4ZjxokIU_NV2W';

export async function POST(request: NextRequest) {
  try {
    const { image, filename, date, mimeType } = await request.json();
    if (!image || !filename) {
      return NextResponse.json({ success: false, error: '画像データとファイル名が必要です' }, { status: 400 });
    }

    // 1. GASからOAuthトークン取得
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

    // 2. 年月フォルダを取得or作成
    const dateStr = date || new Date().toISOString().split('T')[0];
    const yearMonth = dateStr.substring(0, 7);
    const folderId = await getOrCreateFolder(token, PARENT_FOLDER_ID, yearMonth);

    // 3. Drive APIでファイルアップロード
    const safeName = filename.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '_').substring(0, 50);

    const boundary = '===boundary===';
    const metadata = JSON.stringify({ name: safeName, parents: [folderId] });
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

    // 4. 共有設定
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return NextResponse.json({
      success: true,
      url: `https://drive.google.com/file/d/${uploadData.id}/view`,
      fileId: uploadData.id,
      folder: yearMonth,
      fileName: safeName,
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
