// v0.30.1: 交通費の通常料金を Claude が概算で返す API
// 対象: 普通電車・バス・新幹線・特急
// 非対象: タクシー・飛行機(変動が大きい)・レンタカー・自家用車・フェリー
// モデル: Claude Sonnet 4.6(OCR/抽出系・komu10標準)
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const ALLOWED_METHODS = new Set(['普通電車', 'バス', '新幹線', '特急']);

export async function POST(request: NextRequest) {
  try {
    const { from, to, method, carrier } = await request.json();

    if (!from || !to || !method) {
      return NextResponse.json({ error: '出発地・到着地・手段は必須です' }, { status: 400 });
    }

    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json({
        error: `${method}は料金検索の対象外です。実額を入力してください。`,
      }, { status: 400 });
    }

    const carrierStr = carrier ? `(${carrier})` : '';
    const prompt = `あなたは日本の公共交通機関の運賃に詳しい専門家です。

以下の区間の片道大人1人分の通常運賃をお答えください。

出発地: ${from}
到着地: ${to}
手段: ${method}${carrierStr}

【重要なルール】
- 回答は数値(円)のみ。例: 580
- 通貨記号(¥)・カンマ・単位・説明文は一切不要
- 通常期の自由席・指定席・座席指定なし(普通電車・バス)の標準的な運賃
- 繁忙期割増・座席指定料金・グリーン料金等は含めない
- 複数経路がある場合は最も一般的な経路の運賃
- 不明・推定不能な場合のみ -1 を返答`;

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = message.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    // 数値のみ抽出(¥や,が混じっていても拾えるよう保険)
    const cleaned = text.replace(/[¥,円\s]/g, '');
    const parsed = parseInt(cleaned, 10);

    if (Number.isNaN(parsed)) {
      return NextResponse.json({
        amount: null,
        error: '料金を取得できませんでした。実額を入力してください。',
      });
    }

    if (parsed < 0) {
      return NextResponse.json({
        amount: null,
        error: 'この区間の料金は推定できませんでした。実額を入力してください。',
      });
    }

    return NextResponse.json({ amount: parsed });
  } catch (err) {
    console.error('estimate-fare error:', err);
    return NextResponse.json({
      amount: null,
      error: '料金検索に失敗しました。時間をおいて再度お試しください。',
    }, { status: 500 });
  }
}
