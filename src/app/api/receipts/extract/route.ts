import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, fileUrl, mimeType } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Image data required' }, { status: 400 });
    }

    // メディアタイプを判定
    const mediaType = mimeType === 'application/pdf' ? 'application/pdf' : 
                      mimeType?.startsWith('image/') ? mimeType : 'image/jpeg';

    // Claude Vision API で読み取り
    const contentItem = mediaType === 'application/pdf' 
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: imageBase64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: imageBase64,
          },
        };

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            contentItem,
            {
              type: 'text',
              text: `この領収書から以下の情報を抽出してください。JSON形式で回答してください。

抽出項目:
- vendor: 店舗名・会社名
- date: 日付（YYYY-MM-DD形式）
- amount: 合計金額（数値のみ、円記号不要）
- tax: 消費税額（あれば）
- items: 品目リスト（あれば）[{name, quantity, price}]
- payment_method: 支払方法（現金、クレジットカード等）

回答はJSONのみ、説明不要。読み取れない項目はnullとしてください。`,
            },
          ],
        },
      ],
    });

    // レスポンスからJSONを抽出
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    let extracted;
    try {
      // JSON部分を抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        extracted = {};
      }
    } catch {
      extracted = {};
    }

    // 信頼度スコア算出 - KAI: 明確なロジック
    let confidence = 0;
    let factors = 0;
    
    if (extracted.vendor) { confidence += 0.25; factors++; }
    if (extracted.date) { confidence += 0.25; factors++; }
    if (extracted.amount && typeof extracted.amount === 'number') { confidence += 0.35; factors++; }
    if (extracted.items?.length > 0) { confidence += 0.15; factors++; }

    const confidenceScore = factors > 0 ? confidence : 0;

    // ステータス判定
    const status = confidenceScore >= 0.85 ? 'processed' : 'needs_review';

    // DB保存
    const { data: receipt, error } = await supabase
      .from('receipts')
      .insert({
        file_url: fileUrl,
        file_name: `receipt_${Date.now()}`,
        ocr_text: responseText,
        ai_extracted: extracted,
        confidence_score: confidenceScore,
        status,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      receiptId: receipt.id,
      fileUrl,
      aiExtracted: extracted,
      confidence: confidenceScore,
      status,
    });

  } catch (error) {
    console.error('Receipt extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to process receipt' },
      { status: 500 }
    );
  }
}
