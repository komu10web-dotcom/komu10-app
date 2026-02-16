import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    // ヘッダー行をスキップ
    const dataLines = lines.slice(1);

    const transactions: Array<{
      date: string;
      description: string;
      amount: number;
      account: string;
      category: string | null;
      counterpart: string | null;
    }> = [];

    for (const line of dataLines) {
      const cols = parseCSVLine(line);
      
      // 最低限の列数チェック
      if (cols.length < 4) continue;

      // 一般的なクレカCSVフォーマット想定
      // 日付, 利用店舗, 利用金額, ...
      const dateStr = cols[0];
      const description = cols[1];
      const amountStr = cols[2];

      // 日付パース
      const date = parseJapaneseDate(dateStr);
      if (!date) continue;

      // 金額パース
      const amount = parseAmount(amountStr);
      if (isNaN(amount)) continue;

      transactions.push({
        date,
        description: description || '不明',
        amount: -Math.abs(amount), // クレカは支出
        account: 'クレジットカード',
        category: guessCategory(description),
        counterpart: null,
      });
    }

    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No valid transactions found' }, { status: 400 });
    }

    // バッチインサート
    const { error } = await supabase.from('transactions').insert(transactions);

    if (error) {
      throw error;
    }

    return NextResponse.json({ imported: transactions.length });
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseJapaneseDate(dateStr: string): string | null {
  // 2024/01/15 or 2024-01-15 or 2024年1月15日
  const patterns = [
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/,
    /(\d{2})\/(\d{2})\/(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      let year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);

      // 2桁年を4桁に
      if (year < 100) {
        year += year > 50 ? 1900 : 2000;
      }

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseAmount(amountStr: string): number {
  // カンマ、円記号、スペースを除去
  const cleaned = amountStr.replace(/[,￥¥円\s]/g, '');
  return parseInt(cleaned, 10);
}

function guessCategory(description: string): string | null {
  const categoryMap: Record<string, string[]> = {
    '旅費交通費': ['JR', '電車', '新幹線', 'タクシー', '航空', 'ANA', 'JAL', 'SUICA', 'PASMO'],
    '通信費': ['ソフトバンク', 'KDDI', 'NTT', 'ドコモ', '楽天モバイル'],
    '消耗品費': ['Amazon', 'ヨドバシ', 'ビックカメラ', '文房具', 'オフィス'],
    '接待交際費': ['レストラン', '居酒屋', 'カフェ', 'スタバ', '会食'],
    '外注費': ['クラウドワークス', 'ランサーズ', 'ココナラ'],
  };

  const upperDesc = description.toUpperCase();
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => upperDesc.includes(kw.toUpperCase()))) {
      return category;
    }
  }
  return null;
}
