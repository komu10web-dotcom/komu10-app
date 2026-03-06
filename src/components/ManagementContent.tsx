'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DIVISIONS } from '@/types/database';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ProjectRow {
  id: string;
  name: string;
  division: string;
  status: string;
  category: string | null;
  location: string | null;
  shoot_date: string | null;
  publish_date: string | null;
  external_id: string | null;
  seq_no: number | null;
}

const DIVISION_FILTER = [
  { value: 'all', label: '全事業' },
  ...Object.entries(DIVISIONS).map(([id, v]) => ({ value: id, label: v.label })),
];

// external_idから事業別IDを生成（例: yt-3 → YT-003）
function formatProjectId(pj: ProjectRow): string {
  const parts: string[] = [];
  if (pj.seq_no) parts.push(`PJ-${String(pj.seq_no).padStart(3, '0')}`);
  if (pj.external_id) {
    const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
    const prefix = div?.prefix || 'GEN';
    const num = pj.external_id.replace(/^yt-/, '');
    parts.push(`${prefix}-${String(num).padStart(3, '0')}`);
  }
  return parts.length > 0 ? parts.map(p => `[${p}]`).join('') : '';
}

export default function ManagementContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [divFilter, setDivFilter] = useState('all');

  const fetchProjects = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('projects')
        .select('id, name, division, status, category, location, shoot_date, publish_date, external_id, seq_no')
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }

      const { data } = await query;
      setProjects((data as ProjectRow[]) || []);
    } catch (err) {
      console.error('Fetch projects error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const result = await res.json();

      if (result.success) {
        setSyncResult({ success: true, message: `同期完了（${result.count}/${result.total}件）` });
        fetchProjects();
      } else {
        setSyncResult({ success: false, message: result.error || '同期に失敗しました' });
      }
    } catch (err) {
      console.error('Sync error:', err);
      setSyncResult({ success: false, message: '同期に失敗しました' });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = divFilter === 'all'
    ? projects
    : projects.filter((p) => p.division === divFilter);

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">経営</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">MANAGEMENT</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同期中...' : 'プロジェクト同期'}
          </button>
        </div>

        {syncResult && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-4 ${
            syncResult.success ? 'bg-[#1B4D3E]/5' : 'bg-[#C23728]/5'
          }`}>
            {syncResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-[#1B4D3E]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#C23728]" />
            )}
            <span className={`text-xs ${syncResult.success ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
              {syncResult.message}
            </span>
          </div>
        )}

        <p className="text-xs text-[#999] mb-4">部門別損益・月別チャート・PJ別損益はPhase 3で実装</p>

        {/* プロジェクト管理 */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs text-[#999]">プロジェクト（{filtered.length}件）</h2>
            <select
              value={divFilter}
              onChange={(e) => setDivFilter(e.target.value)}
              className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none"
            >
              {DIVISION_FILTER.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#ccc]">
              プロジェクトがありません
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((pj) => {
                const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
                const pjId = formatProjectId(pj);
                return (
                  <div key={pj.id} className="px-4 py-3 hover:bg-[#F5F5F3]/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1"
                          style={{ background: div?.color || '#C4B49A' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {pjId && (
                              <span className="text-[10px] font-['Saira_Condensed'] text-[#999] tabular-nums shrink-0">{pjId}</span>
                            )}
                            <span className="text-sm text-[#1a1a1a] truncate">{pj.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-medium" style={{ color: div?.color || '#999' }}>
                              {div?.label || pj.division}
                            </span>
                            {pj.category && (
                              <span className="text-[10px] text-[#999] bg-[#F5F5F3] px-1.5 py-0.5 rounded">{pj.category}</span>
                            )}
                            {pj.location && (
                              <span className="text-[10px] text-[#999]">{pj.location}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${
                        pj.status === 'completed' ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' :
                        pj.status === 'active' ? 'bg-[#D4A03A]/10 text-[#D4A03A]' :
                        'bg-gray-100 text-[#999]'
                      }`}>
                        {pj.status === 'completed' ? '完了' : pj.status === 'active' ? '進行中' : pj.status === 'ordered' ? '受注' : pj.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
