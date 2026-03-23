import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxTJC1o9bj--xU_cae3bGpz62-QzqjpfPuBOVAxXF7Y0nk2BLXAYmrPqma5i25JQ9to/exec';

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase設定がありません' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // GASからスプレッドシートデータ取得（サーバーサイドなのでCORS問題なし）
    const gasRes = await fetch(`${GAS_URL}?action=sync`);
    const gasData = await gasRes.json();

    if (!gasData.projects || !Array.isArray(gasData.projects)) {
      return NextResponse.json({ error: '同期データの形式が不正です', raw: gasData }, { status: 400 });
    }

    let savedCount = 0;
    const errors: string[] = [];

    for (const pj of gasData.projects) {
      if (!pj.externalId || !pj.name) continue;

      const { error: upsertErr } = await supabase
        .from('projects')
        .upsert({
          external_id: `yt-${pj.externalId}`,
          name: pj.name,
          division: pj.division || 'youtube',
          owner: 'tomo',
          status: (() => {
            const s = (pj.status || '').toLowerCase();
            if (s === '公開' || s === 'published') return 'published';
            if (s === '企画' || s === 'planning') return 'planning';
            if (s === '完了' || s === 'completed') return 'completed';
            if (s === '受注済' || s === 'ordered') return 'ordered';
            // 動画制作 / active / その他 → 進行中
            return 'active';
          })(),
          category: pj.category || null,
          location: pj.location || null,
          shoot_date: pj.shootDate || null,
          publish_date: pj.publishDate || null,
          youtube_id: pj.youtubeId || null,
        }, { onConflict: 'external_id' });

      if (upsertErr) {
        errors.push(`yt-${pj.externalId}: ${upsertErr.message}`);
      } else {
        savedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      count: savedCount,
      total: gasData.projects.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '同期に失敗しました' },
      { status: 500 }
    );
  }
}
