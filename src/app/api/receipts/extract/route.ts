import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, fileUrl, mimeType, fileName } = await request.json();

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

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            contentItem,
            {
              type: 'text',
              text: `この領収書を読み取り、以下のJSON形式で回答してください。

【絶対ルール】
- 回答はJSONオブジェクトのみ。説明文・前置き・コードブロック（\`\`\`json 等）は一切付けない。
- 画像が掠れていたり斜めでも、読める部分から最大限抽出する。完全に読めない項目のみnull。
- 推測で値を入れない。読み取れない項目はnull。手書きで判読不能な箇所もnull。

【共通抽出項目】
- vendor: 店舗名・会社名（住所と混同するな。ロゴ・ヘッダ・フッタの社名を優先）
- date: 利用日（YYYY-MM-DD形式）
  ※ 搭乗日・宿泊日・乗車日・サービス提供日など実際にサービスを利用した日付を最優先。
  ※ 発行日・購入日・表示日ではなく利用日を返すこと。
  ※ 和暦（令和7年4月18日）/R7.4.18/2026.4.18 は全てYYYY-MM-DDに正規化。
  ※ 利用日が完全に不明な場合のみ発行日を使用。
- amount: 合計金額（数値のみ、円記号不要）
  ※ 優先順位: 「ご請求金額」>「合計（税込）」>「お買上計」>「合計」>「総額」。
  ※ 「お預り」「お釣り」「税抜」「小計」は絶対に取り違えるな。
  ※ 複数の合計欄がある場合、税込総額を選ぶ。
- tax: 消費税額（あれば、数値のみ）
- items: 品目リスト [{name, quantity, price}]（読み取れた範囲で）
- item_name: 主要な品名1つ（最高額または主たる購入品。例: "MacBook Pro 14インチ"）。
  ※ 交通費・飲食・サブスクの場合はnull。
- payment_method: 支払方法。以下のいずれか1つを返す:
  ※ "ic"（Suica/PASMO/ICOCA等のIC決済）
  ※ "cash"（現金）
  ※ "credit"（クレジットカード）
  ※ "invoice"（請求書払い）
  ※ 不明はnull。
- kamoku_hint: 以下から最適な勘定科目を1つ選択:
  travel（交通・宿泊・新幹線・特急券・JR・私鉄・タクシー・飛行機・ホテル）,
  equipment（物品購入・カメラ機材・PC・周辺機器）,
  communication（通信費・携帯・インターネット）,
  entertainment（取引先との接待・会食・贈答）,
  torizai（取材先との飲食・取材費）,
  meeting（打合せ時の飲食5000円以下・会議室代）,
  welfare（社員懇親・福利厚生）,
  production（YouTube等の制作費・撮影用衣装小物）,
  advertising（広告宣伝）,
  subscription（月額サービス・年額サブスク）,
  software（ソフトウェア買い切り）,
  training（セミナー受講料・研修費）,
  commission（振込手数料・決済手数料）,
  supplies（文房具等）,
  rent（家賃）,
  utility（水道光熱費）,
  misc（不明）

【交通費の場合のみ追加で抽出】
kamoku_hint が "travel" かつ鉄道・バス・タクシー・飛行機の場合:
- from_station: 出発地・出発駅（例: "横浜市内", "東京", "新宿"）。読み取れなければnull。
- to_station: 到着地・到着駅（例: "出雲市", "新大阪", "京都"）。読み取れなければnull。
- round_trip: "round_trip"（往復券・復路券・「ゆき・かえり」両方記載）か "one_way"（片道券・単一区間）か。判断不能ならnull。
- carrier: 鉄道会社・航空会社名（例: "JR西日本", "ANA", "東京メトロ"）。読み取れなければnull。
宿泊（ホテル領収書）の場合は from_station / to_station / round_trip は全てnullで構わない。

【接待交際費・会議費・取材費の場合のみ追加で抽出】
kamoku_hint が "entertainment" / "meeting" / "torizai" / "welfare" の場合:
- guest_count: 利用人数（数値のみ。「2名様」「4名」等から抽出）。読み取れなければnull。
- restaurant_type: 業態（例: "和食", "中華", "イタリアン", "居酒屋", "カフェ", "焼肉"）。読み取れなければnull。
※ 相手先名（取引先名）はレシートから読み取れないことが多いので推測しない。

【物品購入の場合のみ追加で抽出】
kamoku_hint が "equipment" / "supplies" / "production" の場合:
- model_number: 型番・モデル番号（例: "MK1H3J/A", "ILCE-7M4"）。読み取れなければnull。
- serial_number: シリアル番号（あれば。固定資産管理用）。読み取れなければnull。
※ item_name には「ブランド+品名+主要スペック」で1行（例: "Sony α7 IV ボディ"）。

【サブスク・月額サービスの場合のみ追加で抽出】
kamoku_hint が "subscription" / "communication" / "software" の場合:
- billing_period_from: 請求期間開始（YYYY-MM-DD）。読み取れなければnull。
- billing_period_to: 請求期間終了（YYYY-MM-DD）。読み取れなければnull。
- next_billing_date: 次回請求日（YYYY-MM-DD）。読み取れなければnull。`,
            },
          ],
        },
      ],
    });

    // レスポンスからJSONを抽出
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    let extracted: Record<string, unknown> = {};
    try {
      // ```json ... ``` のコードフェンスを剥がす
      const cleaned = responseText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*$/g, '')
        .trim();
      // JSON部分を抽出（最初の { から対応する最後の } まで）
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Receipt JSON parse failed:', parseErr, '\nraw:', responseText);
      extracted = {};
    }

    // 失敗気味の場合は raw レスポンスをログ出力（Vercel Functions Logs で原因追跡）
    const hasMinimalFields = Boolean(
      (extracted as { vendor?: unknown }).vendor ||
      (extracted as { amount?: unknown }).amount
    );
    if (!hasMinimalFields) {
      console.warn('Receipt extract sparse result. raw:', responseText.slice(0, 1000));
    }

    // 信頼度スコア算出 - KAI: 明確なロジック
    let confidence = 0;
    let factors = 0;

    const items = extracted.items;
    if (extracted.vendor) { confidence += 0.25; factors++; }
    if (extracted.date) { confidence += 0.25; factors++; }
    if (extracted.amount && typeof extracted.amount === 'number') { confidence += 0.35; factors++; }
    if (Array.isArray(items) && items.length > 0) { confidence += 0.15; factors++; }

    const confidenceScore = factors > 0 ? confidence : 0;

    // AI読み取り結果を直接返す
    return NextResponse.json({
      aiExtracted: extracted,
      confidence: confidenceScore,
    });

  } catch (error) {
    console.error('Receipt extraction error:', error);
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    return NextResponse.json(
      { error: 'Failed to process receipt', details: errorMessage },
      { status: 500 }
    );
  }
}
