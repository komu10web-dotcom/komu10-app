import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const AI_MODEL = 'claude-opus-4-7';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 勘定科目マスタ（AIへの説明用）
const KAMOKU_DESCRIPTIONS: Record<string, string> = {
  travel: '旅費交通費（出張・取引先訪問の交通費・宿泊費）',
  equipment: '消耗品費（10万円未満の備品・物品購入）',
  communication: '通信費（電話・インターネット・郵送）',
  entertainment: '接待交際費（取引先との会食・贈答）',
  torizai: '取材費（取材対象との飲食・取材に伴う費用）※案件タグ必須',
  meeting: '会議費（打合せの飲食5,000円以下・会議室代）',
  welfare: '福利厚生費（社員懇親・健康診断等）',
  supplies: '事務用品費（文房具・書類）',
  outsource: '外注費（業務委託・制作委託）',
  production: '制作費（YouTube等の制作費・撮影衣装小物・撮影題材としての宿泊）※案件タグ必須',
  advertising: '広告宣伝費（広告出稿・PR）',
  rent: '地代家賃（事務所家賃）',
  utility: '水道光熱費',
  insurance: '保険料',
  vehicle: '車両費（ガソリン・駐車場・整備）',
  tax: '租税公課（印紙・収入印紙・各種税金）',
  commission: '支払手数料（振込手数料・決済手数料・プラットフォーム手数料）',
  subscription: 'サブスクリプション（月額サービス）',
  software: 'ソフトウェア（ソフト購入・ライセンス）',
  training: '研修費（セミナー・書籍・研修受講料）',
  repair: '修繕費',
  misc: '雑費（他のいずれにも該当しない少額支出）',
};

interface ConsultationRequest {
  // 入力中 or 既存経費の文脈
  context: {
    transaction_id?: string | null;
    date?: string;
    amount?: number;
    store?: string;
    kamoku?: string;
    item_name?: string;
    description?: string;
    payment_method?: string;
    project_id?: string | null;
    division?: string;
  };
  owner: 'tomo' | 'toshiki';
  // 既存メッセージ履歴（無ければ初回相談）
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  // ユーザーの今回の発言（無ければ初回挨拶を生成）
  userMessage?: string;
  // 既存の相談ID（あれば追記更新、無ければ新規作成）
  consultationId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsultationRequest;
    const { context, owner, messages = [], userMessage, consultationId } = body;

    if (!context || !owner) {
      return NextResponse.json({ error: 'context and owner required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // 1. 過去の類似取引を取得（同店名・直近5件 + 同科目・直近5件）
    let similarByStore: any[] = [];
    let similarByKamoku: any[] = [];

    if (context.store) {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount, store, kamoku, item_description, project_id')
        .eq('owner', owner)
        .eq('tx_type', 'expense')
        .eq('store', context.store)
        .order('date', { ascending: false })
        .limit(5);
      similarByStore = data || [];
    }

    if (context.kamoku) {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount, store, kamoku, item_description, project_id')
        .eq('owner', owner)
        .eq('tx_type', 'expense')
        .eq('kamoku', context.kamoku)
        .order('date', { ascending: false })
        .limit(5);
      similarByKamoku = data || [];
    }

    // 2. システムプロンプト構築
    const kamokuList = Object.entries(KAMOKU_DESCRIPTIONS)
      .map(([key, desc]) => `- ${key}: ${desc}`)
      .join('\n');

    const contextLines = [
      context.date ? `日付: ${context.date}` : null,
      context.amount ? `金額: ¥${context.amount.toLocaleString()}` : null,
      context.store ? `支払先: ${context.store}` : null,
      context.kamoku ? `現在の科目（暫定）: ${context.kamoku}（${KAMOKU_DESCRIPTIONS[context.kamoku] || '不明'}）` : null,
      context.item_name ? `品名: ${context.item_name}` : null,
      context.description ? `内容: ${context.description}` : null,
      context.payment_method ? `支払方法: ${context.payment_method}` : null,
      context.project_id ? `案件タグ: あり` : `案件タグ: なし`,
    ].filter(Boolean).join('\n');

    const similarStoreLines = similarByStore.length > 0
      ? similarByStore.map(t => `  - ${t.date} ¥${t.amount.toLocaleString()} ${t.store} → 科目: ${t.kamoku}${t.item_description ? ` / ${t.item_description}` : ''}`).join('\n')
      : '  （該当なし）';

    const similarKamokuLines = similarByKamoku.length > 0
      ? similarByKamoku.slice(0, 5).map(t => `  - ${t.date} ¥${t.amount.toLocaleString()} ${t.store || '(支払先未記入)'}${t.item_description ? ` / ${t.item_description}` : ''}`).join('\n')
      : '  （該当なし）';

    const systemPrompt = `あなたは komu10（コムテン）専属の会計アシスタントです。日本の所得税法・消費税法に基づいて、勘定科目の選択・按分・処理方法について簡潔にアドバイスします。

【komu10 の事業構造（2026年5月現在）】
- 運営: 小林寿樹（トシキ）と長谷友子（トモ）の共同オペレーター体制（個人事業主・2027年に合同会社化予定）
- 5部門:
  - YT（YouTube）: YouTube チャンネル運営。撮影・出演者・移動・小道具すべて「制作費」で計上。
  - EDIT: 編集・体験設計。案件単位で「制作費」または「外注費」。
  - TP（THIS PLACE）: 旅館・サウナ等の体験設計事業。視察・取材は「取材費」、関連移動は「取材費の交通費」。
  - SUP: 事業伴走・業務支援（他社のクリエイティブ・経営伴走）。純粋な業務移動は「旅費交通費」。
  - GEN: その他汎用業務。

【重要な判断軸】
- YouTube・案件絡みの移動費は原則「制作費」（出演者・スタッフ含めて1取引でまとめて計上）。
- 出演者・社外スタッフの交通費を立て替えた場合は別取引（請求書ベース・源泉徴収注意）。
- 観光列車（ふたつ星4047・SL人吉等）は乗車自体が体験商品 → 旅費交通費ではなく取材費・広告宣伝費・研修費等。
- ななつ星・四季島・瑞風 等のクルーズトレインは旅行プラン → 旅費交通費では計上不可。
- 個人事業主のため福利厚生費は計上不可（2027年法人化で再開予定）。
- 上位クラス座席（ビジネス・グリーン・グランクラス等）は撮影業務時のみ業務必要性が立つ → 制作費の中で扱うのが原則、純粋な業務移動でビジネスクラスは税務調査リスク高。

【重要な制約】
- 必ず日本語で回答する
- 1回の回答は3文以内、長くても5文以内に収める
- 自信がない場合は明確に「判断が分かれる」「税理士に相談を推奨」と伝える
- 法人税の話は最小限（個人事業主の所得税申告が前提・2027年以降は法人税も視野）
- 確定的な「これにすべき」ではなく、根拠とともに提案する

【利用可能な勘定科目】
${kamokuList}

【ユーザーの相談対象（経費）】
${contextLines}

【過去の類似取引（同じ支払先）】
${similarStoreLines}

【過去の類似取引（現在の科目: ${context.kamoku || '未設定'}）】
${similarKamokuLines}

【回答ルール】
1. ユーザーが科目選択を質問した場合: 推奨科目1〜2個と簡潔な根拠を提示
2. ユーザーが按分を質問した場合: 一般的な按分率の目安を提示（事業使用率の判断はユーザー本人）
3. 過去の類似取引と異なる科目になる場合は、その理由を明示
4. 取材費(torizai)・制作費(production)を提案する場合は「案件タグ必須」と必ず付記
5. YouTube 案件の交通費は「旅費交通費」ではなく「制作費」を第一推奨とする（他事業の場合は除く）`;

    // 3. メッセージ配列構築
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [...messages];

    // 初回相談時、userMessageが無ければデフォルトの初回質問を生成（AI側から状況サマリーを返す）
    if (apiMessages.length === 0 && !userMessage) {
      apiMessages.push({
        role: 'user',
        content: 'この経費について、適切な勘定科目を教えてください。',
      });
    } else if (userMessage) {
      apiMessages.push({ role: 'user', content: userMessage });
    }

    // 4. Anthropic API呼び出し
    const response = await getAnthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages: apiMessages,
    });

    const assistantText = response.content[0].type === 'text' ? response.content[0].text : '';

    // 5. メッセージ履歴を更新
    const updatedMessages = [...apiMessages, { role: 'assistant' as const, content: assistantText }];

    // 6. AIの回答から「推奨科目」を抽出（本文の最も早い位置に登場した科目を優先）
    let suggestedKamoku: string | null = null;
    let earliestIdx = Infinity;
    for (const kamokuKey of Object.keys(KAMOKU_DESCRIPTIONS)) {
      const idx = assistantText.indexOf(kamokuKey);
      if (idx >= 0 && idx < earliestIdx) {
        earliestIdx = idx;
        suggestedKamoku = kamokuKey;
      }
    }

    // 7. DB保存（新規 or 更新）
    let savedConsultationId = consultationId;
    if (!savedConsultationId) {
      // 新規作成
      const { data, error } = await supabase
        .from('accounting_consultations')
        .insert({
          owner,
          transaction_id: context.transaction_id || null,
          context_snapshot: context,
          similar_context: { similar_by_store: similarByStore, similar_by_kamoku: similarByKamoku },
          messages: updatedMessages,
          ai_model: AI_MODEL,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Consultation insert error:', error);
        return NextResponse.json({ error: 'Failed to save consultation', details: error.message }, { status: 500 });
      }
      savedConsultationId = data.id;
    } else {
      // 既存更新（messages追記）
      const { error } = await supabase
        .from('accounting_consultations')
        .update({ messages: updatedMessages })
        .eq('id', savedConsultationId);

      if (error) {
        console.error('Consultation update error:', error);
      }
    }

    return NextResponse.json({
      consultationId: savedConsultationId,
      assistantMessage: assistantText,
      suggestedKamoku,
      messages: updatedMessages,
    });
  } catch (error) {
    console.error('Consultation API error:', error);
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    return NextResponse.json(
      { error: 'Consultation failed', details: errorMessage },
      { status: 500 }
    );
  }
}

// 相談結果を確定（resolution & resolved_kamoku を保存）
export async function PATCH(request: NextRequest) {
  try {
    const { consultationId, resolution, resolvedKamoku } = await request.json();
    if (!consultationId || !resolution) {
      return NextResponse.json({ error: 'consultationId and resolution required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('accounting_consultations')
      .update({
        resolution,
        resolved_kamoku: resolvedKamoku || null,
      })
      .eq('id', consultationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
