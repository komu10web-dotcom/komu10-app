'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS } from '@/types/database';
import type { AnbunSetting, Asset, RevenueType, RevenueTypeDivision, ContractType } from '@/types/database';
import { Plus, Pencil, Trash2, Save, X, Loader2, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

// ============================================================
// 定数
// ============================================================
const ANBUN_KAMOKU = ['communication', 'rent', 'utility', 'vehicle', 'subscription', 'software'] as const;

const ASSET_CATEGORIES = [
  { value: 'camera', label: 'カメラ', defaultLife: 5 },
  { value: 'lens', label: 'レンズ', defaultLife: 5 },
  { value: 'pc', label: 'PC', defaultLife: 4 },
  { value: 'drone', label: 'ドローン', defaultLife: 5 },
  { value: 'other', label: 'その他', defaultLife: 5 },
] as const;

const THEMES = [
  { value: 'light', label: 'ライト', desc: '標準の白背景', color: '#F5F5F3' },
  { value: 'warm', label: 'ウォーム', desc: '暖かみのある背景', color: '#FAF6F0' },
  { value: 'cool', label: 'クール', desc: '涼しげな背景', color: '#F0F4F8' },
] as const;

const QA_ITEMS = [
  {
    q: '撮影旅行の食事は経費になる？',
    a: '取材目的の食事は「接待交際費」として計上できます。ただし、一人での食事は原則認められません。取材先や同行者との食事で、取材メモや写真があると根拠になります。',
  },
  {
    q: 'カメラの購入はどう処理する？',
    a: '10万円未満は「消耗品費」として一括経費。10万円以上は「固定資産」として登録し、耐用年数（カメラは5年）で減価償却します。設定ページの固定資産台帳で管理できます。',
  },
  {
    q: '按分とは？',
    a: '自宅兼事務所の家賃や通信費など、事業とプライベート両方で使う費用について、事業利用分の割合（%）だけを経費にする仕組みです。税務署への根拠説明が必要なので、メモに理由を残しましょう。',
  },
  {
    q: '交通費に領収書は必要？',
    a: '電車・バスは領収書不要ですが、IC履歴や乗車区間の記録が必要です。タクシーは領収書必須。飛行機は搭乗券の控えも保管してください。',
  },
  {
    q: 'YouTubeの広告収益はどう計上する？',
    a: 'Googleからの入金時に「売上高」として計上します。収益タイプは「広告収益（YouTube）」を選択。月次でAdSenseのレポートと突合しましょう。',
  },
  {
    q: '確定申告の期限は？',
    a: '毎年2月16日〜3月15日が申告期間です。青色申告の65万円控除を受けるにはe-Taxでの電子申告が必要です。このアプリの確定申告ページからE-TAXに転記できます。',
  },
  {
    q: 'サブスクリプションの処理は？',
    a: 'Adobe CC、クラウドストレージ等の月額サービスは、事業利用割合に応じて按分します。設定ページで按分率を登録し、明細に「事業利用◯%」とメモを残しましょう。',
  },
  {
    q: '2人（トモ・トシキ）の経費はどう分ける？',
    a: '各取引に「担当者」を設定します。確定申告は個人別に行うため、担当者ごとに売上・経費が自動分離されます。共通経費は按分設定で各自の割合を設定してください。',
  },
];

// ============================================================
// ユーティリティ
// ============================================================
const yen = (n: number) => '¥' + Math.floor(n).toLocaleString('ja-JP');

// ============================================================
// メインコンポーネント
// ============================================================
export default function SettingsContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'tomo';
  const effectiveOwner = owner === 'all' ? 'tomo' : owner;
  const ownerLabel = effectiveOwner === 'tomo' ? 'トモ' : 'トシキ';

  const [loading, setLoading] = useState(true);

  // 按分設定
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [anbunDraft, setAnbunDraft] = useState<Record<string, { ratio: number; note: string }>>({});
  const [anbunSaving, setAnbunSaving] = useState(false);
  const [anbunSaved, setAnbunSaved] = useState(false);

  // 固定資産
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // テーマ
  const [currentTheme, setCurrentTheme] = useState('light');
  const [themeSaving, setThemeSaving] = useState(false);

  // 決算期
  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalConfirmOpen, setFiscalConfirmOpen] = useState(false);
  const [fiscalPendingMonth, setFiscalPendingMonth] = useState(1);

  // Q&A
  const [openQA, setOpenQA] = useState<number | null>(null);

  // 契約区分
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [ctEditId, setCtEditId] = useState<string | null>(null);
  const [ctEditName, setCtEditName] = useState('');
  const [ctNewName, setCtNewName] = useState('');
  const [ctSaving, setCtSaving] = useState(false);

  // 収益タイプ
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [revenueTypeDivisions, setRevenueTypeDivisions] = useState<RevenueTypeDivision[]>([]);
  const [rtEditId, setRtEditId] = useState<string | null>(null);
  const [rtEditName, setRtEditName] = useState('');
  const [rtEditDivisions, setRtEditDivisions] = useState<string[]>([]);
  const [rtNewName, setRtNewName] = useState('');
  const [rtNewDivisions, setRtNewDivisions] = useState<string[]>([]);
  const [rtSaving, setRtSaving] = useState(false);

  // ============================================================
  // データ取得
  // ============================================================
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      // 按分設定
      const { data: anbunData } = await supabase
        .from('anbun_settings')
        .select('*')
        .eq('owner', effectiveOwner);

      // 固定資産
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });

      // プロフィール（テーマ）
      const { data: profileData } = await supabase
        .from('profiles')
        .select('theme')
        .eq('user_key', effectiveOwner)
        .single();

      // 契約区分
      const { data: ctData } = await supabase
        .from('contract_types')
        .select('*')
        .order('sort_order');

      // 収益タイプ
      const { data: rtData } = await supabase
        .from('revenue_types')
        .select('*')
        .order('sort_order');

      // 収益タイプ×事業
      const { data: rtdData } = await supabase
        .from('revenue_type_divisions')
        .select('*');

      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
      if (profileData) {
        setCurrentTheme(profileData.theme || 'light');
        setFiscalStartMonth((profileData as any).fiscal_start_month || 1);
      }
      setContractTypes(ctData || []);
      setRevenueTypes(rtData || []);
      setRevenueTypeDivisions(rtdData || []);

      // 按分ドラフト初期化
      const draft: Record<string, { ratio: number; note: string }> = {};
      for (const k of ANBUN_KAMOKU) {
        const existing = (anbunData || []).find((a: AnbunSetting) => a.kamoku === k);
        draft[k] = {
          ratio: existing?.ratio ?? 0,
          note: existing?.note ?? '',
        };
      }
      setAnbunDraft(draft);
    } catch (err) {
      console.error('設定データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOwner]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================
  // 按分設定の保存
  // ============================================================
  const saveAnbun = async () => {
    if (!supabase) return;
    setAnbunSaving(true);

    try {
      for (const kamoku of ANBUN_KAMOKU) {
        const draft = anbunDraft[kamoku];
        if (!draft) continue;

        const existing = anbunSettings.find(a => a.kamoku === kamoku);

        if (existing) {
          // 更新
          await supabase
            .from('anbun_settings')
            .update({ ratio: draft.ratio, note: draft.note || null })
            .eq('id', existing.id);
        } else if (draft.ratio > 0) {
          // 新規作成（ratio > 0のもののみ）
          await supabase
            .from('anbun_settings')
            .insert({
              kamoku,
              owner: effectiveOwner,
              ratio: draft.ratio,
              note: draft.note || null,
            });
        }
      }

      setAnbunSaved(true);
      setTimeout(() => setAnbunSaved(false), 2000);
      // 再取得
      const { data } = await supabase
        .from('anbun_settings')
        .select('*')
        .eq('owner', effectiveOwner);
      setAnbunSettings(data || []);
    } catch (err) {
      console.error('按分設定保存エラー:', err);
    } finally {
      setAnbunSaving(false);
    }
  };

  // ============================================================
  // 固定資産の保存
  // ============================================================
  const saveAsset = async (form: AssetForm) => {
    if (!supabase) return;

    try {
      const payload = {
        name: form.name,
        category: form.category,
        owner: effectiveOwner,
        acquisition_date: form.acquisitionDate,
        acquisition_cost: form.acquisitionCost,
        useful_life: form.usefulLife,
        business_use_ratio: form.businessUseRatio,
      };

      if (editingAsset) {
        await supabase
          .from('assets')
          .update(payload)
          .eq('id', editingAsset.id);
      } else {
        await supabase.from('assets').insert(payload);
      }

      setAssetModalOpen(false);
      setEditingAsset(null);

      // 再取得
      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });
      setAssets(data || []);
    } catch (err) {
      console.error('固定資産保存エラー:', err);
    }
  };

  const deleteAsset = async (id: string) => {
    if (!supabase) return;

    try {
      await supabase.from('assets').delete().eq('id', id);
      setDeleteTarget(null);

      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });
      setAssets(data || []);
    } catch (err) {
      console.error('固定資産削除エラー:', err);
    }
  };

  // ============================================================
  // テーマ保存
  // ============================================================
  const saveTheme = async (theme: string) => {
    if (!supabase) return;
    setThemeSaving(true);
    setCurrentTheme(theme);

    try {
      await supabase
        .from('profiles')
        .update({ theme })
        .eq('user_key', effectiveOwner);
    } catch (err) {
      console.error('テーマ保存エラー:', err);
    } finally {
      setThemeSaving(false);
    }
  };

  // 決算期保存
  const saveFiscalMonth = async (month: number) => {
    if (!supabase) return;
    setFiscalSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ fiscal_start_month: month } as any)
        .eq('user_key', effectiveOwner);
      setFiscalStartMonth(month);
    } catch (err) {
      console.error('決算期保存エラー:', err);
    } finally {
      setFiscalSaving(false);
    }
  };

  // ============================================================
  // 契約区分 CRUD
  // ============================================================
  const addContractType = async () => {
    if (!supabase || !ctNewName.trim()) return;
    setCtSaving(true);
    try {
      const maxSort = contractTypes.length > 0 ? Math.max(...contractTypes.map(c => c.sort_order)) : 0;
      await supabase.from('contract_types').insert({ name: ctNewName.trim(), sort_order: maxSort + 1 });
      setCtNewName('');
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分追加エラー:', err); }
    finally { setCtSaving(false); }
  };

  const updateContractType = async (id: string) => {
    if (!supabase || !ctEditName.trim()) return;
    setCtSaving(true);
    try {
      await supabase.from('contract_types').update({ name: ctEditName.trim() }).eq('id', id);
      setCtEditId(null);
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分更新エラー:', err); }
    finally { setCtSaving(false); }
  };

  const deleteContractType = async (id: string) => {
    if (!supabase) return;
    if (!confirm('この契約区分を削除しますか？')) return;
    try {
      await supabase.from('contract_types').delete().eq('id', id);
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分削除エラー:', err); }
  };

  // ============================================================
  // 収益タイプ CRUD
  // ============================================================
  const addRevenueType = async () => {
    if (!supabase || !rtNewName.trim()) return;
    setRtSaving(true);
    try {
      const maxSort = revenueTypes.length > 0 ? Math.max(...revenueTypes.map(r => r.sort_order)) : 0;
      const { data: inserted } = await supabase
        .from('revenue_types')
        .insert({ name: rtNewName.trim(), sort_order: maxSort + 1 })
        .select()
        .single();
      // 事業紐付け
      if (inserted && rtNewDivisions.length > 0) {
        const links = rtNewDivisions.map(div => ({ revenue_type_id: inserted.id, division: div }));
        await supabase.from('revenue_type_divisions').insert(links);
      }
      setRtNewName('');
      setRtNewDivisions([]);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ追加エラー:', err); }
    finally { setRtSaving(false); }
  };

  const startEditRevenueType = (rt: RevenueType) => {
    setRtEditId(rt.id);
    setRtEditName(rt.name);
    const linked = revenueTypeDivisions.filter(d => d.revenue_type_id === rt.id).map(d => d.division);
    setRtEditDivisions(linked);
  };

  const updateRevenueType = async (id: string) => {
    if (!supabase || !rtEditName.trim()) return;
    setRtSaving(true);
    try {
      await supabase.from('revenue_types').update({ name: rtEditName.trim() }).eq('id', id);
      // 事業紐付け差し替え
      await supabase.from('revenue_type_divisions').delete().eq('revenue_type_id', id);
      if (rtEditDivisions.length > 0) {
        const links = rtEditDivisions.map(div => ({ revenue_type_id: id, division: div }));
        await supabase.from('revenue_type_divisions').insert(links);
      }
      setRtEditId(null);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ更新エラー:', err); }
    finally { setRtSaving(false); }
  };

  const deleteRevenueType = async (id: string) => {
    if (!supabase) return;
    if (!confirm('この収益タイプを削除しますか？')) return;
    try {
      await supabase.from('revenue_type_divisions').delete().eq('revenue_type_id', id);
      await supabase.from('revenue_types').delete().eq('id', id);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ削除エラー:', err); }
  };

  const refreshRevenueTypes = async () => {
    if (!supabase) return;
    const [rtRes, rtdRes] = await Promise.all([
      supabase.from('revenue_types').select('*').order('sort_order'),
      supabase.from('revenue_type_divisions').select('*'),
    ]);
    setRevenueTypes(rtRes.data || []);
    setRevenueTypeDivisions(rtdRes.data || []);
  };

  const toggleDivision = (list: string[], setList: (v: string[]) => void, div: string) => {
    setList(list.includes(div) ? list.filter(d => d !== div) : [...list, div]);
  };

  // ============================================================
  // レンダリング
  // ============================================================
  if (loading) {
    return (
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">設定</h1>
          <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">
            SETTINGS — {ownerLabel}
          </p>
        </div>

        {/* ── 按分設定 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            按分設定
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-[11px] text-[#999] mb-4 leading-relaxed">
              事業とプライベート兼用の費目について、事業利用割合を設定します。
              確定申告の経費計算に反映されます。
            </p>
            <div className="space-y-3">
              {ANBUN_KAMOKU.map(k => {
                const kamokuDef = KAMOKU[k as keyof typeof KAMOKU];
                const draft = anbunDraft[k] || { ratio: 0, note: '' };

                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-sm text-[#333] w-32 shrink-0">
                      {kamokuDef?.name || k}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.ratio}
                        onChange={e =>
                          setAnbunDraft(prev => ({
                            ...prev,
                            [k]: { ...prev[k], ratio: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="w-16 px-2 py-1.5 border border-[#e0e0e0] rounded-lg text-right text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                      />
                      <span className="text-xs text-[#999]">%</span>
                    </div>
                    <input
                      type="text"
                      value={draft.note}
                      onChange={e =>
                        setAnbunDraft(prev => ({
                          ...prev,
                          [k]: { ...prev[k], note: e.target.value },
                        }))
                      }
                      placeholder="根拠メモ（例：作業部屋15㎡/全体60㎡）"
                      className="flex-1 px-2 py-1.5 border border-[#e0e0e0] rounded-lg text-xs text-[#666] placeholder:text-[#ccc] focus:outline-none focus:border-[#D4A03A] transition-colors"
                    />
                  </div>
                );
              })}
            </div>

            {/* 按分の目安 */}
            <div className="mt-4 p-3 bg-[#FFFBF0] rounded-lg border border-[#F5E6C8]">
              <p className="text-[10px] text-[#B8860B] font-medium mb-1">按分の目安</p>
              <p className="text-[10px] text-[#8B7355] leading-relaxed">
                携帯: 50% / WiFi: 50〜70% / 家賃: 面積割合 / 光熱費: 面積割合 / 車両: ロケ使用割合
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {anbunSaved && (
                <span className="text-xs text-[#1B4D3E]">✓ 保存しました</span>
              )}
              <button
                onClick={saveAnbun}
                disabled={anbunSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
              >
                {anbunSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                保存
              </button>
            </div>
          </div>
        </section>

        {/* ── 固定資産台帳 ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-medium tracking-widest text-[#999]">
              固定資産台帳
            </div>
            <button
              onClick={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              className="flex items-center gap-1 text-xs text-[#D4A03A] hover:text-[#b8862e] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              追加
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {assets.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#999]">
                固定資産が登録されていません
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#f0f0f0]">
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">資産名</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">種類</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">取得日</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">取得価額</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">耐用年数</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">事業割合</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">年間償却</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(a => {
                      const annualDep = Math.floor(
                        (a.acquisition_cost / a.useful_life) * (a.business_use_ratio / 100)
                      );
                      const catLabel = ASSET_CATEGORIES.find(c => c.value === a.category)?.label || a.category;

                      return (
                        <tr key={a.id} className="border-b border-[#fafafa] hover:bg-[#fafafa] transition-colors">
                          <td className="px-4 py-2.5 text-[#333]">{a.name}</td>
                          <td className="px-4 py-2.5 text-[#666]">{catLabel}</td>
                          <td className="px-4 py-2.5 text-[#666]">{a.acquisition_date}</td>
                          <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm">{yen(a.acquisition_cost)}</td>
                          <td className="px-4 py-2.5 text-right text-[#666]">{a.useful_life}年</td>
                          <td className="px-4 py-2.5 text-right text-[#666]">{a.business_use_ratio}%</td>
                          <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm text-[#C23728]">{yen(annualDep)}/年</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => {
                                  setEditingAsset(a);
                                  setAssetModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-[#eee] transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-[#999]" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(a.id)}
                                className="p-1 rounded hover:bg-[#fee] transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-[#C23728]" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── テーマ ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            テーマ
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex gap-4">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => saveTheme(t.value)}
                  disabled={themeSaving}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    currentTheme === t.value
                      ? 'border-[#D4A03A] shadow-sm'
                      : 'border-[#e0e0e0] hover:border-[#ccc]'
                  }`}
                >
                  <div
                    className="w-full h-8 rounded-lg mb-2"
                    style={{ backgroundColor: t.color }}
                  />
                  <div className="text-sm text-[#333] font-medium">{t.label}</div>
                  <div className="text-[10px] text-[#999] mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 決算期 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">決算期</div>
          <div className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-4 mb-3">
              <div>
                <label className="text-xs text-[#999] block mb-1">決算期の開始月</label>
                <select
                  value={fiscalStartMonth}
                  onChange={(e) => {
                    const newMonth = parseInt(e.target.value);
                    if (newMonth !== 1) {
                      setFiscalPendingMonth(newMonth);
                      setFiscalConfirmOpen(true);
                    } else {
                      saveFiscalMonth(1);
                    }
                  }}
                  className="px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}月</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-[#666] pt-4">
                {fiscalStartMonth === 1
                  ? '1月〜12月（暦年・個人事業主の標準）'
                  : `${fiscalStartMonth}月〜${fiscalStartMonth === 1 ? 12 : fiscalStartMonth - 1 + 12 > 12 ? fiscalStartMonth - 1 : fiscalStartMonth + 11}月`
                }
              </div>
            </div>
            <p className="text-[10px] text-[#999]">個人事業主は暦年（1月〜12月）が法定です。法人化した場合のみ変更してください。</p>
          </div>
        </section>

        {/* 決算期変更確認ダイアログ */}
        {fiscalConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setFiscalConfirmOpen(false)} />
            <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
              <div className="mb-4">
                <p className="text-sm font-medium text-[#1a1a1a] mb-2">決算期を変更しますか？</p>
                <div className="bg-[#C23728]/5 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-[#C23728]">個人事業主は暦年（1月〜12月）が税法で定められています。変更不可です。</p>
                </div>
                <p className="text-xs text-[#666]">法人（合同会社等）として届出済みの場合のみ、決算期を変更してください。</p>
              </div>
              <p className="text-xs text-[#999] mb-4">開始月を <strong>{fiscalPendingMonth}月</strong> に変更します。本当に変更しますか？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFiscalConfirmOpen(false)}
                  className="flex-1 py-2 rounded-lg text-xs text-[#999] bg-[#F5F5F3] hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    saveFiscalMonth(fiscalPendingMonth);
                    setFiscalConfirmOpen(false);
                  }}
                  disabled={fiscalSaving}
                  className="flex-1 py-2 rounded-lg text-xs text-white bg-[#C23728] hover:bg-[#a02020] transition-colors disabled:opacity-40"
                >
                  {fiscalSaving ? '保存中...' : '変更する'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── データバックアップ ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">データバックアップ</div>
          <div className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <p className="text-xs text-[#666] mb-3">
              全テーブルのデータをJSON形式でダウンロードします。アプリの改修・移行時にデータを復元できます。定期的にバックアップを取ることを推奨します。
            </p>
            <div className="flex items-center gap-3">
              <a
                href="/api/backup"
                download
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                JSONバックアップをダウンロード
              </a>
              <span className="text-[10px] text-[#999]">transactions, projects, assets, 按分設定 等すべて含む</span>
            </div>
          </div>
        </section>

        {/* ── Q&A ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[10px] font-medium tracking-widest text-[#999]">
              Q&A
            </div>
            <HelpCircle className="w-3 h-3 text-[#ccc]" />
          </div>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-[#f0f0f0]">
            {QA_ITEMS.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenQA(openQA === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#fafafa] transition-colors"
                >
                  <span className="text-sm text-[#333]">{item.q}</span>
                  {openQA === i ? (
                    <ChevronUp className="w-4 h-4 text-[#999] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#999] shrink-0" />
                  )}
                </button>
                {openQA === i && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-[#666] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 契約区分管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            契約区分
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {contractTypes.map((ct) => (
              <div key={ct.id} className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] last:border-b-0">
                {ctEditId === ct.id ? (
                  <>
                    <input
                      type="text"
                      value={ctEditName}
                      onChange={(e) => setCtEditName(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-[#D4A03A] rounded-md outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') updateContractType(ct.id); if (e.key === 'Escape') setCtEditId(null); }}
                      autoFocus
                    />
                    <button onClick={() => updateContractType(ct.id)} disabled={ctSaving} className="p-1 hover:bg-black/5 rounded-md">
                      <Save className="w-3.5 h-3.5 text-[#1B4D3E]" />
                    </button>
                    <button onClick={() => setCtEditId(null)} className="p-1 hover:bg-black/5 rounded-md">
                      <X className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-[#333]">{ct.name}</span>
                    <button onClick={() => { setCtEditId(ct.id); setCtEditName(ct.name); }} className="p-1 hover:bg-black/5 rounded-md">
                      <Pencil className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                    <button onClick={() => deleteContractType(ct.id)} className="p-1 hover:bg-[#C23728]/10 rounded-md">
                      <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {/* 新規追加 */}
            <div className="flex items-center gap-2 px-5 py-3">
              <input
                type="text"
                value={ctNewName}
                onChange={(e) => setCtNewName(e.target.value)}
                placeholder="新しい契約区分..."
                className="flex-1 px-2 py-1 text-sm bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                onKeyDown={(e) => { if (e.key === 'Enter') addContractType(); }}
              />
              <button
                onClick={addContractType}
                disabled={!ctNewName.trim() || ctSaving}
                className="p-1.5 bg-[#1a1a1a] text-white rounded-md disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* ── 収益タイプ管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            収益タイプ
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {revenueTypes.map((rt) => {
              const linkedDivs = revenueTypeDivisions.filter(d => d.revenue_type_id === rt.id).map(d => d.division);
              const isEditing = rtEditId === rt.id;

              return (
                <div key={rt.id} className="px-5 py-3 border-b border-[#f0f0f0] last:border-b-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={rtEditName}
                          onChange={(e) => setRtEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-[#D4A03A] rounded-md outline-none"
                          autoFocus
                        />
                        <button onClick={() => updateRevenueType(rt.id)} disabled={rtSaving} className="p-1 hover:bg-black/5 rounded-md">
                          <Save className="w-3.5 h-3.5 text-[#1B4D3E]" />
                        </button>
                        <button onClick={() => setRtEditId(null)} className="p-1 hover:bg-black/5 rounded-md">
                          <X className="w-3.5 h-3.5 text-[#999]" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(DIVISIONS).map(([divId, divVal]) => (
                          <button
                            key={divId}
                            onClick={() => toggleDivision(rtEditDivisions, setRtEditDivisions, divId)}
                            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                              rtEditDivisions.includes(divId)
                                ? 'text-white border-transparent'
                                : 'text-[#999] border-[#e0e0e0] bg-white'
                            }`}
                            style={rtEditDivisions.includes(divId) ? { backgroundColor: divVal.color } : undefined}
                          >
                            {divVal.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <span className="text-sm text-[#333]">{rt.name}</span>
                        {linkedDivs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {linkedDivs.map(divId => {
                              const divVal = DIVISIONS[divId as keyof typeof DIVISIONS];
                              return divVal ? (
                                <span
                                  key={divId}
                                  className="px-1.5 py-0.5 text-[9px] rounded-full text-white"
                                  style={{ backgroundColor: divVal.color }}
                                >
                                  {divVal.label}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                      <button onClick={() => startEditRevenueType(rt)} className="p-1 hover:bg-black/5 rounded-md">
                        <Pencil className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                      <button onClick={() => deleteRevenueType(rt.id)} className="p-1 hover:bg-[#C23728]/10 rounded-md">
                        <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* 新規追加 */}
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rtNewName}
                  onChange={(e) => setRtNewName(e.target.value)}
                  placeholder="新しい収益タイプ..."
                  className="flex-1 px-2 py-1 text-sm bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                />
                <button
                  onClick={addRevenueType}
                  disabled={!rtNewName.trim() || rtSaving}
                  className="p-1.5 bg-[#1a1a1a] text-white rounded-md disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {rtNewName.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(DIVISIONS).map(([divId, divVal]) => (
                    <button
                      key={divId}
                      onClick={() => toggleDivision(rtNewDivisions, setRtNewDivisions, divId)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        rtNewDivisions.includes(divId)
                          ? 'text-white border-transparent'
                          : 'text-[#999] border-[#e0e0e0] bg-white'
                      }`}
                      style={rtNewDivisions.includes(divId) ? { backgroundColor: divVal.color } : undefined}
                    >
                      {divVal.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── 固定資産モーダル ── */}
      {assetModalOpen && (
        <AssetModal
          asset={editingAsset}
          onSave={saveAsset}
          onClose={() => {
            setAssetModalOpen(false);
            setEditingAsset(null);
          }}
        />
      )}

      {/* ── 削除確認 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-lg">
            <p className="text-sm text-[#333] mb-4">この固定資産を削除しますか？</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs text-[#666] bg-[#F5F5F3] rounded-lg hover:bg-[#eee] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => deleteAsset(deleteTarget)}
                className="px-4 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 固定資産モーダル
// ============================================================
interface AssetForm {
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessUseRatio: number;
}

function AssetModal({
  asset,
  onSave,
  onClose,
}: {
  asset: Asset | null;
  onSave: (form: AssetForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AssetForm>(() => {
    if (asset) {
      return {
        name: asset.name,
        category: asset.category,
        acquisitionDate: asset.acquisition_date,
        acquisitionCost: asset.acquisition_cost,
        usefulLife: asset.useful_life,
        businessUseRatio: asset.business_use_ratio,
      };
    }
    return {
      name: '',
      category: 'camera',
      acquisitionDate: new Date().toISOString().split('T')[0],
      acquisitionCost: 0,
      usefulLife: 5,
      businessUseRatio: 100,
    };
  });

  const handleCategoryChange = (cat: string) => {
    const defaultLife = ASSET_CATEGORIES.find(c => c.value === cat)?.defaultLife || 5;
    setForm(prev => ({
      ...prev,
      category: cat,
      usefulLife: asset ? prev.usefulLife : defaultLife, // 新規時のみデフォルト設定
    }));
  };

  const canSave = form.name.trim() && form.acquisitionCost > 0;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[#333]">
            {asset ? '固定資産を編集' : '固定資産を追加'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#eee] transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 資産名 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">資産名</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例：Sony α7IV"
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          {/* 種類 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">種類</label>
            <select
              value={form.category}
              onChange={e => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors bg-white"
            >
              {ASSET_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* 取得日 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">取得日</label>
            <input
              type="date"
              value={form.acquisitionDate}
              onChange={e => setForm(prev => ({ ...prev, acquisitionDate: e.target.value }))}
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          {/* 取得価額 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">取得価額（円）</label>
            <input
              type="number"
              value={form.acquisitionCost || ''}
              onChange={e => setForm(prev => ({ ...prev, acquisitionCost: parseInt(e.target.value) || 0 }))}
              placeholder="350000"
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 耐用年数 */}
            <div>
              <label className="block text-[10px] font-medium text-[#999] mb-1">耐用年数</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.usefulLife}
                  onChange={e => setForm(prev => ({ ...prev, usefulLife: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                />
                <span className="text-xs text-[#999]">年</span>
              </div>
            </div>

            {/* 事業使用割合 */}
            <div>
              <label className="block text-[10px] font-medium text-[#999] mb-1">事業使用割合</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.businessUseRatio}
                  onChange={e => setForm(prev => ({ ...prev, businessUseRatio: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                />
                <span className="text-xs text-[#999]">%</span>
              </div>
            </div>
          </div>

          {/* 年間償却額プレビュー */}
          {form.acquisitionCost > 0 && (
            <div className="p-3 bg-[#F5F5F3] rounded-lg">
              <span className="text-[10px] text-[#999]">年間償却額（定額法）：</span>
              <span className="font-['Saira_Condensed'] text-sm text-[#C23728] ml-1">
                {yen(Math.floor((form.acquisitionCost / form.usefulLife) * (form.businessUseRatio / 100)))}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#666] bg-[#F5F5F3] rounded-lg hover:bg-[#eee] transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave}
            className="px-4 py-2 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] disabled:opacity-30 transition-colors"
          >
            {asset ? '更新' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
