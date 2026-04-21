import { NextRequest, NextResponse } from 'next/server';

const GAS_URL = process.env.DEFAULT_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbwiGFVxofGPnaPJnox_K7GeW01elk9ZGPoN0dWC9bi9hqoKdEmXbGtxQZjDRWw94oah/exec';

/**
 * Drive ファイルをゴミ箱に移動（trashed=true）
 * 30日間復元可能。404は成功扱い（冪等性）
 */
export async function POST(request: NextRequest) {
  try {
    const { fileIds } = await request.json();
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ success: false, error: 'fileIds配列が必要です' }, { status: 400 });
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

    const trashed: string[] = [];
    const failed: Array<{ fileId: string; error: string }> = [];

    for (const fileId of fileIds) {
      if (!fileId || typeof fileId !== 'string') {
        failed.push({ fileId: String(fileId), error: 'invalid fileId' });
        continue;
      }
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trashed: true }),
        });
        if (res.ok) {
          trashed.push(fileId);
        } else if (res.status === 404) {
          trashed.push(fileId);
        } else {
          const errText = await res.text();
          failed.push({ fileId, error: `${res.status}: ${errText.substring(0, 200)}` });
        }
      } catch (err) {
        failed.push({ fileId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({ success: failed.length === 0, trashed, failed });
  } catch (error) {
    console.error('Drive trash error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
