import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { image, filename, date, mimeType } = await request.json();

    if (!image || !filename) {
      return NextResponse.json(
        { success: false, error: '画像データとファイル名が必要です' },
        { status: 400 }
      );
    }

    const gasUrl = process.env.NEXT_PUBLIC_GAS_URL;
    if (!gasUrl) {
      return NextResponse.json(
        { success: false, error: 'GAS URLが設定されていません' },
        { status: 500 }
      );
    }

    // サーバーサイドからGASを叩く（CORS問題なし）
    const gasResponse = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        filename,
        date: date || new Date().toISOString().split('T')[0],
        mimeType: mimeType || 'image/jpeg',
      }),
      redirect: 'follow', // GASのリダイレクトに対応
    });

    if (!gasResponse.ok) {
      const errorText = await gasResponse.text();
      console.error('GAS error:', gasResponse.status, errorText);
      return NextResponse.json(
        { success: false, error: `GASエラー: ${gasResponse.status}` },
        { status: 502 }
      );
    }

    const result = await gasResponse.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'アップロードに失敗しました' },
      { status: 500 }
    );
  }
}
