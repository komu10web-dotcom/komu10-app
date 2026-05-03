'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, TRANSACTION_STATUS, PROJECT_TAG_REQUIRED_KAMOKU } from '@/types/database';

// ステータスバッジの色定義
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  forecast: { bg: 'bg-app-surface-alt', text: 'text-app-text-mute' },
  accrued:  { bg: 'bg-content-scene-notes/10', text: 'text-app-green' },
  billed:   { bg: 'bg-app-gold/10', text: 'text-app-gold' },
  settled:  { bg: 'bg-app-green/10', text: 'text-app-green' },
};
import type { Transaction, Project } from '@/types/database';
import { Plus, Upload, Pencil, Trash2, Search, Loader2, Sparkles, Layers } from 'lucide-react';
import TransactionModal from './TransactionModal';
import BulkReceiptModal from './BulkReceiptModal';
import ConsultationModal from './ConsultationModal';
import { usePeriodRange } from './HeaderControls';

export default function ExpensesContent() {
  const { owner, startDate, endDate } = usePeriodRange();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルター
  const [searchText, setSearchText] = useState('');
  // v0.9.0: 未紐付けフィルター（取材費・制作費で案件タグなし）
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [untaggedIds, setUntaggedIds] = useState<Set<string>>(new Set());

  // モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);

  // CSVインポート
  const [importing, setImporting] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // 削除確認（v0.11.0: 領収書情報も保持）
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    driveFileIds: string[];
  } | null>(null);

  // v0.10.0: AI会計相談モーダル（一覧行から呼び出し）
  const [consultTarget, setConsultTarget] = useState<Transaction | null>(null);

  // プロジェクト（TransactionModalに渡す）
  const [projects, setProjects] = useState<Project[]>([]);

  // v0.11.0: 経費ID → 領収書件数
  const [receiptCountMap, setReceiptCountMap] = useState<Map<string, number>>(new Map());

  const fetchTransactions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('tx_type', 'expense')
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }

      const { data, error } = await query;
      if (error) throw error;
      const txList = (data as Transaction[]) || [];
      setTransactions(txList);

      // v0.9.0: 取材費・制作費で案件タグ未紐付けのtx IDを検出
      const requiredKamokuSet = new Set(PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]);
      const targetTxIds = txList
        .filter(tx => requiredKamokuSet.has(tx.kamoku))
        .map(tx => tx.id);
      if (targetTxIds.length > 0) {
        const { data: allocData } = await supabase
          .from('transaction_allocations')
          .select('transaction_id, project_id')
          .in('transaction_id', targetTxIds);
        // project_idが紐付いているtx IDのSet
        const taggedIds = new Set<string>();
        (allocData as any[] || []).forEach(a => {
          if (a.project_id) taggedIds.add(a.transaction_id);
        });
        // 対象科目のうち、taggedIdsに含まれないものが未紐付け
        const untagged = new Set<string>();
        targetTxIds.forEach(id => { if (!taggedIds.has(id)) untagged.add(id); });
        setUntaggedIds(untagged);
      } else {
        setUntaggedIds(new Set());
      }

      // プロジェクト取得
      const { data: pjData } = await supabase.from('projects').select('*').order('name');
      setProjects((pjData as Project[]) || []);

      // v0.11.0: 領収書件数マップを構築
      if (txList.length > 0) {
        const txIds = txList.map(t => t.id);
        const { data: receiptData } = await supabase
          .from('expense_receipts' as any)
          .select('transaction_id')
          .in('transaction_id', txIds);
        const countMap = new Map<string, number>();
        (receiptData as any[] || []).forEach(r => {
          countMap.set(r.transaction_id, (countMap.get(r.transaction_id) || 0) + 1);
        });
        setReceiptCountMap(countMap);
      } else {
        setReceiptCountMap(new Map());
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // フィルター適用
  const filtered = transactions.filter((tx) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      // v0.30.3: 検索対象を拡張(支払先・説明文に加えて科目ラベルも)
      const kamokuLabel = (tx.kamoku && KAMOKU[tx.kamoku as keyof typeof KAMOKU]?.name) || '';
      const haystack = `${tx.store || ''} ${tx.description || ''} ${kamokuLabel}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    // v0.9.0: 未紐付けフィルター
    if (showOnlyUntagged && !untaggedIds.has(tx.id)) return false;
    return true;
  });

  // 集計
  const expenseSum = filtered.reduce((s, t) => s + t.amount, 0);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  // v0.11.0: 削除ターゲットをセット（領収書情報もフェッチ）
  const requestDelete = async (id: string) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('expense_receipts' as any)
        .select('drive_file_id')
        .eq('transaction_id', id);
      const driveFileIds = (data || []).map((r: any) => r.drive_file_id).filter(Boolean);
      setDeleteTarget({ id, driveFileIds });
    } catch {
      setDeleteTarget({ id, driveFileIds: [] });
    }
  };

  // 削除実行（v0.11.0: Drive ゴミ箱連動）
  const handleDelete = async (target: { id: string; driveFileIds: string[] }) => {
    if (!supabase) return;
    try {
      // 1. transactions 削除（CASCADE で expense_receipts も削除）
      const { error } = await supabase.from('transactions').delete().eq('id', target.id);
      if (error) throw error;

      // 2. Drive ゴミ箱移動（ベストエフォート）
      if (target.driveFileIds.length > 0) {
        try {
          await fetch('/api/upload/trash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: target.driveFileIds }),
          });
        } catch (trashErr) {
          console.warn('Drive trash failed (non-fatal):', trashErr);
        }
      }

      setDeleteTarget(null);
      fetchTransactions();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // CSVインポート
  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/transactions/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, owner: owner === 'all' ? 'tomo' : owner }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      fetchTransactions();
    } catch (err) {
      console.error('CSV import error:', err);
      alert('CSVインポートに失敗しました');
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー(δ案語彙・明色基調・縦積み構造) ── */}
        <div className="mb-8 pb-5 border-b border-app-line-medium">
          <div>
            <p className="font-['Saira_Condensed'] text-[11px] tracking-[0.3em] text-app-gold mb-3 font-medium">
              VOLUME 02 · EXPENSES
            </p>
            <h1 className="font-['Shippori_Mincho'] text-[26px] font-normal text-app-text leading-[1.4] tracking-[0.03em]">
              いくら、投じているか。
            </h1>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-app-button text-white rounded-lg text-xs font-medium hover:bg-app-button-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              手入力
            </button>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-app-text rounded-lg text-xs font-medium hover:bg-app-surface transition-colors border border-app-line-medium"
            >
              <Layers className="w-3.5 h-3.5" />
              まとめて
            </button>
            <label className="flex items-center gap-1.5 px-4 py-2 bg-white text-app-text rounded-lg text-xs font-medium hover:bg-app-surface transition-colors cursor-pointer border border-app-line-medium">
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'インポート中...' : 'CSV'}
              <input
                ref={csvRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvImport(f);
                }}
              />
            </label>
          </div>
        </div>

        {/* ── フィルター ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-mute" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="支払先・科目で検索"
              className="pl-8 pr-3 py-2 bg-white rounded-lg text-xs border border-app-line-medium outline-none focus:ring-2 focus:ring-app-gold/50 w-56"
            />
          </div>
          {/* v0.9.0: 未紐付けフィルタートグル（取材費・制作費で案件タグ未紐付け） */}
          {untaggedIds.size > 0 && (
            <button
              onClick={() => setShowOnlyUntagged(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
                showOnlyUntagged
                  ? 'bg-app-red/10 border-app-red/30 text-app-red'
                  : 'bg-white border-app-line-medium text-app-text-sub hover:border-app-red/30'
              }`}
            >
              未紐付け {untaggedIds.size}件
            </button>
          )}
          <span className="text-xs text-app-text-mute ml-auto">
            {filtered.length}件
          </span>
        </div>

        {/* ── テーブル ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-app-gold animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-app-text-fade">
              {searchText || showOnlyUntagged ? (
                <>
                  条件に一致する取引がありません
                  {searchText && (
                    <div className="mt-2 text-xs text-app-text-mute">「{searchText}」</div>
                  )}
                </>
              ) : (
                '取引がありません'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app-line">
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">日付</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">支払先</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">科目</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal">金額</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx) => {
                    const kamokuName = KAMOKU[tx.kamoku as keyof typeof KAMOKU]?.name || tx.kamoku;
                    const effStatus = tx.status || 'settled';
                    const statusStyle = STATUS_STYLES[effStatus] || STATUS_STYLES.settled;
                    const statusLabel = TRANSACTION_STATUS[effStatus as keyof typeof TRANSACTION_STATUS] || TRANSACTION_STATUS.settled;
                    return (
                      <tr key={tx.id} className="border-b border-app-line hover:bg-app-surface-alt/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-app-text-mute tabular-nums">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-app-text">{tx.store || '—'}</div>
                          {tx.description && (
                            <div className="text-xs text-app-text-mute mt-0.5">{tx.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-app-text-sub">
                          <div className="flex items-center gap-1.5">
                            <span>{kamokuName}</span>
                            {untaggedIds.has(tx.id) && (
                              <span className="px-1.5 py-0.5 bg-app-red/10 text-app-red rounded text-[9px] font-medium">
                                タグ未
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-app-text">
                          <div className="flex items-center justify-end gap-1.5">
                            {receiptCountMap.get(tx.id) ? (
                              <span
                                className="text-[9px] bg-app-green/10 text-app-green px-1.5 py-0.5 rounded-full font-medium"
                                title={`領収書 ${receiptCountMap.get(tx.id)}件`}
                              >
                                📎 {receiptCountMap.get(tx.id)}
                              </span>
                            ) : null}
                            <span>{formatAmount(tx.amount)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setConsultTarget(tx)}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                              title="AIに相談"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button
                              onClick={() => { setEditTarget(tx); setModalOpen(true); }}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button
                              onClick={() => requestDelete(tx.id)}
                              className="p-1.5 hover:bg-app-red/10 rounded-md transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-app-text-mute" />
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

          {/* ── フッター集計 ── */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-end px-4 py-3 border-t border-app-line bg-app-surface-alt/50">
              <div className="text-xs">
                <span className="text-app-text-mute">合計: </span>
                <span className="font-['Saira_Condensed'] text-app-text tabular-nums">{formatAmount(expenseSum)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 手入力/編集モーダル ── */}
      <TransactionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={fetchTransactions}
        editData={editTarget}
        defaultOwner={owner}
        projects={projects}
      />

      {/* ── v0.19.0: 複数領収書一括取込モーダル ── */}
      <BulkReceiptModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSaved={fetchTransactions}
        defaultOwner={owner === 'all' ? 'tomo' : owner}
        projects={projects}
      />

      {/* ── v0.10.0: AI会計相談モーダル（一覧行から） ── */}
      {consultTarget && (
        <ConsultationModal
          context={{
            transaction_id: consultTarget.id,
            date: consultTarget.date,
            amount: consultTarget.amount,
            store: consultTarget.store || undefined,
            kamoku: consultTarget.kamoku,
            item_name: consultTarget.item_description || undefined,
            description: consultTarget.description || undefined,
            project_id: consultTarget.project_id,
            division: consultTarget.division,
          }}
          owner={(consultTarget.owner === 'tomo' || consultTarget.owner === 'toshiki') ? consultTarget.owner : 'tomo'}
          onUpdateTransaction={async (transactionId, updates) => {
            if (!supabase) return;
            const { error } = await supabase
              .from('transactions')
              .update(updates)
              .eq('id', transactionId);
            if (error) throw error;
            await fetchTransactions();
          }}
          onClose={() => setConsultTarget(null)}
        />
      )}

      {/* ── 削除確認（v0.11.0: 領収書のゴミ箱連動も案内） ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-app-text mb-2 font-medium">この取引を削除しますか？</p>
            {deleteTarget.driveFileIds.length > 0 ? (
              <p className="text-xs text-app-text-sub mb-4 leading-relaxed">
                領収書 {deleteTarget.driveFileIds.length}件 もまとめてゴミ箱に移します。<br />
                <span className="text-app-text-mute">30日間は元に戻せます。</span>
              </p>
            ) : (
              <p className="text-xs text-app-text-sub mb-4">削除すると、元に戻せません。</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-app-red rounded-lg hover:bg-app-red-hover transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
