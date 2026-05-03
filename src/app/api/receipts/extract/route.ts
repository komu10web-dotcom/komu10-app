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
- passenger_count: 利用人数（数値のみ）。「おとな2名」「大人2名」「2名様」「2人」等から抽出。1名・記載なし・判別不能はnull。**この値があれば、登録時に金額を1人あたりではなく合計金額として扱うため正確に読み取ること**。
- transport_class_hint: 座席クラスの手がかり。以下のいずれかを返す:
  ※ "self_seat"（自由席）, "reserved"（指定席）, "green"（グリーン車）, "gran_class"（グランクラス）,
  ※ "premium_seat"（個室・プレミアム・スーパーシート等）,
  ※ "economy"（飛行機エコノミー）, "premium_economy"（プレエコ）, "business"（ビジネスクラス）, "first"（ファーストクラス）,
  ※ "class_j"（JALクラスJ）, "ana_premium"（ANAプレミアムクラス）,
  ※ 不明・記載なしはnull。
- flight_train_no_hint: 便名・列車名（例: "JAL301", "のぞみ15号", "やまびこ53号"）。読み取れなければnull。
宿泊（ホテル領収書）の場合は from_station / to_station / round_trip / passenger_count / transport_class_hint / flight_train_no_hint は全てnullで構わない。

【接待交際費・会議費・取材費の場合のみ追加で抽出】
kamoku_hint が "entertainment" / "meeting" / "torizai" の場合:
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
- next_billing_date: 次回請求日（YYYY-MM-DD）。読み取れなければnull。

【制作費・取材費の場合のみ追加で抽出】
kamoku_hint が "production" または "torizai" の場合:
- sub_category_hint: 以下から最適な内訳タグキーを1つ選択。判断不能ならnull。

  【制作費の内訳タグ(kamoku_hint='production'時に選択)】
  prod_transport（移動・タクシー・電車・新幹線・飛行機）,
  prod_lodging（宿泊・ホテル・旅館）,
  prod_meal（飲食・撮影現場食事）,
  prod_costume（衣装・スタイリング用品）,
  prod_props（小道具・備品・消耗品）,
  prod_venue（場所代・スタジオ・ロケ地使用料）,
  prod_cast_fee（出演謝礼・モデル協力者謝礼）,
  prod_staff_fee（スタッフ謝礼・カメラマン・ヘアメイク等外注人件費）,
  prod_rental（機材レンタル・カメラ・照明・音響レンタル）,
  prod_music（音源・素材・BGM・効果音・フォント）,
  prod_editing（編集外注・カラコレ・MA外部委託）,
  prod_printing（印刷・制作物・チラシ・パンフ・ポスター）,
  prod_shipping（配送・運搬・機材配送）,
  prod_parking（駐車場）,
  prod_permit（使用許可・ロケ申請・施設使用料）,
  prod_reference（参考資料・取材補助・書籍・雑誌）,
  prod_performance（興行・観戦・スポーツ観戦・ライブ・演劇・コンサート・歌舞伎・ミュージカル）,
  prod_attraction（体験・施設・テーマパーク・動物園・水族館・美術館・博物館）,
  prod_seasonal_event（季節イベント・花火大会・イルミネーション・祭り・フェスティバル）,
  prod_other（その他制作費）

  【取材費の内訳タグ(kamoku_hint='torizai'時に選択)】
  tori_transport（移動・取材先交通費）,
  tori_lodging（宿泊・取材先宿泊）,
  tori_meal（飲食・取材時飲食・同行者との食事）,
  tori_entry（入場・拝観料・施設入場料・観覧料）,
  tori_gift（手土産・お礼・取材先手土産）,
  tori_cast_fee（取材謝礼・取材協力者謝礼）,
  tori_reference（資料・書籍・下調べ資料）,
  tori_printing（資料印刷・取材資料印刷代）,
  tori_performance（興行・観戦・スポーツ観戦・ライブ・演劇・コンサート・歌舞伎・ミュージカル）,
  tori_attraction（体験・施設・テーマパーク・動物園・水族館・美術館・博物館）,
  tori_seasonal_event（季節イベント・花火大会・イルミネーション・祭り・フェスティバル）,
  tori_other（その他取材費）

  例: レストラン領収書→"prod_meal" or "tori_meal"、ホテル領収書→"prod_lodging" or "tori_lodging"、タクシー領収書→"prod_transport" or "tori_transport"、東京ドーム→"prod_performance" or "tori_performance"、USJチケット→"prod_attraction" or "tori_attraction"。
  ※ kamoku_hint が制作費・取材費以外の時は sub_category_hint は null。`,
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
