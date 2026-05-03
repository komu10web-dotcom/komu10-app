import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * v0.39.0: 取引登録前の最終校閲API
 * モデル: claude-opus-4-7 (推論・判断系で世界最高水準)
 * 戦略: Prompt Caching でルールセットをキャッシュ→実効コスト¥4/件以下
 *
 * チェック対象:
 *   1. 経費区分(科目・内訳)の整合性
 *   2. 記載漏れ(業務理由・利用人数・相手先名等の必須項目)
 *   3. 誤字脱字・桁ミス
 *   4. 税法整合(個人事業主・法人化前の禁則)
 *   5. 業務文脈整合(komu10運用ルール)
 */

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// 校閲ルールセット(変更頻度低・全リクエスト共通 → Prompt Cache 対象)
const AUDIT_RULES = `あなたはkomu10(個人事業主・小林寿樹)の経理・税務最終校閲AIです。
取引登録前に、人間が見落とした問題を構造的に検出してください。

# 1. komu10 経費区分の絶対ルール
- youtube: YouTube制作専用経費(撮影・編集・出演等)
- production: 制作費(YouTube以外の映像・記事・コンテンツ制作)
- editing: 編集・体験設計関連
- this_place: THIS PLACE 関連
- support: 事業伴走・業務支援(旧data・businessを統合)
- general: その他
- travel: 旅費交通費(業務移動)
- entertainment: 接待交際費
- meeting: 会議費
- torizai: 取材費
- communication: 通信費
- equipment: 備品・固定資産(10万円以上)
- supplies: 消耗品費
- utility: 水道光熱費
- welfare: 福利厚生費 ★個人事業主は計上不可。法人化(2027年予定)前は登録NG。
- misc: 不明

# 2. 必須項目チェック
- 接待交際費・会議費: guest_name(相手先名) 必須
- 取材費: 取材対象・取材内容(description) 必須
- **上位クラス利用時のみ** class_reason(業務理由) 必須。komu10 における上位クラスの定義:
  - 上位クラス = グリーン車・グランクラス・個室/プレミアム(東武スペーシアX等)・プレミアムエコノミー・ビジネスクラス・ファーストクラス
  - **クラスJ(JAL)・プレミアムクラス(ANA)は上位クラス扱いしない**(普通席相当・業務理由不要)
  - 普通席・指定席・自由席・普通車も業務理由不要
- 3万円以上の交通費: 領収書添付必須
- 制作費・取材費: sub_category(内訳タグ) 必須

# 3. 税法整合
- 福利厚生費は個人事業主では NG(エラー)
- 30万円以上の物品: 一括経費不可・固定資産化必要(警告)
- 業務按分(自家用車・自宅家賃等): business_ratio 100%は警告(税務調査リスク)

# 4. 誤字脱字・桁ミスチェック
- 金額が領収書OCR値と大きく乖離(±20%以上): 警告
- 日付が未来日: エラー ★必ず「今日」(user メッセージで提供される today 値)を基準に判定。本日より後の日付のみ未来日。
- 日付が3ヶ月以上前: 警告(記憶違いリスク・本日基準で90日以上前)
- 取引先名・地名の明らかな誤字: 警告

# 5. 業務文脈整合(★komu10運用ルール)
- ★YouTube ロケ移動: kamoku=production + sub_category=prod_transport(移動) は **正常パターン**。指摘禁止。
- ★取材移動費: kamoku=torizai + sub_category=tori_transport も **正常パターン**。指摘禁止。
- ★純粋な業務移動: kamoku=travel が原則
- description が「YouTube ロケ」「撮影」「取材」「ロケハン」等を含み、kamoku=production または torizai であれば、それは正しい運用。INFOレベルでも指摘禁止。

# 6. ★絶対指摘禁止項目(過去の誤判定再発防止)
- transportData.purpose の値そのものに対する指摘禁止(初期値の可能性が高く、ユーザーの実意を反映していない)
- description と kamoku の組合せが上記「業務文脈整合」で正常パターンと判定されるなら指摘しない
- 入力値に問題がない場合に「念のため確認を」のような曖昧な warning/info を出さない

# 出力形式(必ずJSONのみ)
{
  "verdict": "pass" | "warning" | "error",
  "issues": [
    {
      "level": "error" | "warning",
      "field": "対象フィールド名(amount/date/kamoku/sub_category/class_reason等)",
      "message": "問題の具体的説明(50字以内)",
      "suggestion": "推奨される修正案(60字以内・任意)"
    }
  ],
  "summary": "全体の総評を1-2文(問題なしなら不要)"
}

verdict のルール:
- error が1件でもあれば "error"(登録ブロック推奨)
- warning のみなら "warning"(注意喚起・登録は可)
- 問題なしなら "pass"・issues は []

★INFO レベルは出力禁止。確実な error/warning のみ指摘。
issues は最大5件まで。検出されない場合は空配列 []。確信が持てない指摘は出さない。
JSON以外の文字を絶対に出力しない。markdown フェンスも禁止。`;

export async function POST(request: NextRequest) {
  try {
    const { transaction, transportData, ocrData, today } = await request.json();

    if (!transaction) {
      return NextResponse.json({ error: 'transaction required' }, { status: 400 });
    }

    // 校閲対象データを構造化(トークン節約のため最小限)
    const auditPayload = {
      transaction: {
        date: transaction.date,
        amount: transaction.amount,
        store: transaction.store,
        kamoku: transaction.kamoku,
        sub_category: transaction.sub_category || null,
        description: transaction.description || null,
        guest_name: transaction.guest_name || null,
        guest_count: transaction.guest_count || null,
        owner: transaction.owner,
        status: transaction.status || 'settled',
        actual_payment_date: transaction.actual_payment_date || null,
      },
      transport: transportData ? {
        // v0.40.1: purpose は null/undefined の時は除外(ユーザー未入力の初期値を渡さない)
        ...(transportData.purpose ? { purpose: transportData.purpose } : {}),
        round_trip: transportData.round_trip,
        fare_input_mode: transportData.fare_input_mode,
        route_legs: transportData.route_legs?.map((l: any) => ({
          from: l.from, to: l.to, method: l.method, carrier: l.carrier,
          amount: l.amount,
          // class_value は実値が選ばれている時のみ渡す(初期値「普通席」は渡さない)
          ...(l.class_value && l.class_value !== '普通席' ? { class_value: l.class_value } : {}),
          ...(l.class_reason ? { class_reason: l.class_reason } : {}),
          green: l.green || undefined,
          flight_train_no: l.flight_train_no || undefined,
          passenger_count: l.passenger_count > 1 ? l.passenger_count : undefined,
        })),
        return_legs: transportData.return_legs?.length > 0 ? transportData.return_legs.map((l: any) => ({
          from: l.from, to: l.to, method: l.method, carrier: l.carrier,
          amount: l.amount,
          ...(l.class_value && l.class_value !== '普通席' ? { class_value: l.class_value } : {}),
        })) : undefined,
        payment_method: transportData.payment_method,
      } : null,
      ocr: ocrData ? {
        amount: ocrData.amount,
        vendor: ocrData.vendor,
        date: ocrData.date,
        from_station: ocrData.from_station,
        to_station: ocrData.to_station,
        carrier: ocrData.carrier,
      } : null,
    };

    const anthropic = getAnthropic();

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: AUDIT_RULES,
          // Prompt Caching: ルールセットをキャッシュ(5分間有効・cache hit時 input単価 ×0.1)
          cache_control: { type: 'ephemeral' } as any,
        },
      ],
      messages: [
        {
          role: 'user',
          content: `本日: ${today || new Date().toISOString().split('T')[0]}

以下の取引を最終校閲してください。問題があれば issues に列挙、なければ空配列(verdict="pass")。

${JSON.stringify(auditPayload, null, 2)}`,
        },
      ],
    });

    // レスポンスからテキスト抽出
    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ verdict: 'pass', issues: [], summary: 'AI応答が空でした' });
    }

    let auditResult;
    try {
      // markdown コードフェンス除去(念のため)
      const cleaned = textBlock.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```\s*$/, '')
        .trim();
      auditResult = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('audit parse error:', parseErr, textBlock.text);
      return NextResponse.json({
        verdict: 'pass',
        issues: [],
        summary: 'AI応答のJSON解析に失敗。校閲をスキップしました。',
      });
    }

    return NextResponse.json(auditResult);
  } catch (e: any) {
    console.error('audit error:', e);
    // 校閲失敗は登録をブロックしない(verdict=pass で返す)
    return NextResponse.json({
      verdict: 'pass',
      issues: [],
      summary: `校閲APIエラー: ${e?.message || 'unknown'}`,
    });
  }
}
