'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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
}

export default function ManagementContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('projects')
        .select('id, name, division, status, category, location, shoot_date, publish_date, external_id')
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
      setSyncResult({ success: false, message: '同期に失敗しました。ネットワークを確認してください。' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ヘッダー */}
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
            {syncing ? '同期中...' : 'スプレッドシート同期'}
          </button>
        </div>

        {/* 同期結果 */}
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

        {/* Phase 3で部門別損益・月別チャート等を実装 */}
        <p className="text-xs text-[#999] mb-4">部門別損益・月別チャートはPhase 3で実装</p>

        {/* プロジェクト一覧（簡易） */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-xs text-[#999]">プロジェクト（{projects.length}件）</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#ccc]">
              プロジェクトがありません
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {projects.map((pj) => (
                <div key={pj.id} className="px-4 py-3 hover:bg-[#F5F5F3]/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm text-[#1a1a1a] truncate">{pj.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {pj.category && (
                          <span className="text-[10px] text-[#999] bg-[#F5F5F3] px-1.5 py-0.5 rounded">{pj.category}</span>
                        )}
                        {pj.location && (
                          <span className="text-[10px] text-[#999]">{pj.location}</span>
                        )}
                        {pj.shoot_date && (
                          <span className="text-[10px] text-[#999] font-['Saira_Condensed'] tabular-nums">{pj.shoot_date}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                      pj.status === 'completed' ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' :
                      pj.status === 'active' ? 'bg-[#D4A03A]/10 text-[#D4A03A]' :
                      'bg-gray-100 text-[#999]'
                    }`}>
                      {pj.status === 'completed' ? '完了' : pj.status === 'active' ? '進行中' : pj.status === 'ordered' ? '受注' : pj.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
