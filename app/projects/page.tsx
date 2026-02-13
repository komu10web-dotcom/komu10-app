'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import Modal from '@/components/Modal';
import ProjectCard from '@/components/ProjectCard';
import ProjectForm from '@/components/ProjectForm';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, DIVISIONS, PROJECT_STATUS, formatYen, formatPercent, getDivision, getStatus, getUser } from '@/lib/constants';

type SortKey = 'name' | 'date' | 'revenue' | 'profit';
type ViewMode = 'card' | 'list';

interface GASProject {
  name: string;
  division: string;
  status: string;
  externalId: string;
  publishDate?: string;
  category?: string;
}

interface GASResponse {
  projects: GASProject[];
  revenue?: Array<{
    date: string;
    amount: number;
    description: string;
    division: string;
  }>;
  fetchedAt: string;
}

export default function ProjectsPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ division: '', status: '', owner: '' });
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [txRes, pjRes] = await Promise.all([
        supabase.from('transactions').select('*'),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ]);
      if (txRes.data) setTransactions(txRes.data);
      if (pjRes.data) setProjects(pjRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'all' || user === 'tomo' || user === 'toshiki') setCurrentUser(user);
    }
  }, []);

  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  const projectStats = useMemo(() => {
    const stats: { [key: string]: { revenue: number; expense: number } } = {};
    transactions.forEach(tx => {
      if (tx.project_id) {
        if (!stats[tx.project_id]) stats[tx.project_id] = { revenue: 0, expense: 0 };
        if (tx.tx_type === 'revenue') stats[tx.project_id].revenue += tx.amount;
        else stats[tx.project_id].expense += tx.amount;
      }
    });
    return stats;
  }, [transactions]);

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => {
      if (filters.division && p.division !== filters.division) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.owner && p.owner !== filters.owner) return false;
      return true;
    });

    result.sort((a, b) => {
      const statsA = projectStats[a.id] || { revenue: 0, expense: 0 };
      const statsB = projectStats[b.id] || { revenue: 0, expense: 0 };
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'date': cmp = (a.created_at || '').localeCompare(b.created_at || ''); break;
        case 'revenue': cmp = statsA.revenue - statsB.revenue; break;
        case 'profit': cmp = (statsA.revenue - statsA.expense) - (statsB.revenue - statsB.expense); break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [projects, filters, sortKey, sortAsc, projectStats]);

  const handleAdd = () => { setEditingProject(undefined); setIsModalOpen(true); };
  const handleEdit = (p: Project) => { setEditingProject(p); setIsModalOpen(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) setProjects(prev => prev.filter(p => p.id !== id));
    setDeleteConfirm(null);
  };

  const handleSubmit = async (data: Partial<Project>) => {
    if (editingProject) {
      const { data: updated, error } = await supabase.from('projects').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingProject.id).select().single();
      if (!error && updated) setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } else {
      const { data: created, error } = await supabase.from('projects').insert([{ ...data, owner: currentUser === 'all' ? 'tomo' : currentUser }]).select().single();
      if (!error && created) setProjects(prev => [created, ...prev]);
    }
    setIsModalOpen(false);
    setEditingProject(undefined);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleSync = async () => {
    const gasUrl = localStorage.getItem('gas_api_url');
    if (!gasUrl) {
      setSyncMessage({ type: 'error', text: '設定ページでGAS URLを設定してください' });
      setTimeout(() => setSyncMessage(null), 5000);
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch(gasUrl);
      if (!response.ok) throw new Error('GASからの取得に失敗しました');
      const data: GASResponse = await response.json();
      if (!data.projects || data.projects.length === 0) {
        setSyncMessage({ type: 'error', text: 'プロジェクトデータがありません' });
        return;
      }
      const owner = currentUser === 'all' ? 'tomo' : currentUser;
      let insertedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      for (const gasProject of data.projects) {
        const projectData = {
          name: gasProject.name,
          division: gasProject.division || 'youtube',
          owner: owner,
          status: gasProject.status || 'active',
          external_id: gasProject.externalId,
          publish_date: gasProject.publishDate || null,
          category: gasProject.category || null,
          updated_at: new Date().toISOString(),
        };
        const { data: existing } = await supabase
          .from('projects')
          .select('id')
          .eq('external_id', gasProject.externalId)
          .single();
        if (existing) {
          const { error } = await supabase.from('projects').update(projectData).eq('id', existing.id);
          if (error) errorCount++;
          else updatedCount++;
        } else {
          const { error } = await supabase.from('projects').insert(projectData);
          if (error) errorCount++;
          else insertedCount++;
        }
      }
      const messages = [];
      if (insertedCount > 0) messages.push(`${insertedCount}件追加`);
      if (updatedCount > 0) messages.push(`${updatedCount}件更新`);
      if (errorCount > 0) messages.push(`${errorCount}件エラー`);
      setSyncMessage({
        type: errorCount > 0 ? 'error' : 'success',
        text: messages.length > 0 ? messages.join('、') : '同期完了（変更なし）',
      });
      const { data: refreshed } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (refreshed) setProjects(refreshed);
    } catch (error) {
      setSyncMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '同期に失敗しました',
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>プロジェクト</h1>
          <div className="flex items-center gap-2">
            <button
              className="btn"
              onClick={handleSync}
              disabled={syncing}
              style={{ background: syncing ? COLORS.textMuted : COLORS.green, color: 'white', opacity: syncing ? 0.7 : 1 }}
            >
              {syncing ? '同期中...' : '同期'}
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>+ プロジェクト追加</button>
          </div>
        </div>

        {syncMessage && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: syncMessage.type === 'success' ? 'rgba(27,77,62,0.1)' : 'rgba(185,28,28,0.1)', color: syncMessage.type === 'success' ? COLORS.green : COLORS.crimson, border: `1px solid ${syncMessage.type === 'success' ? COLORS.green : COLORS.crimson}20` }}>
            {syncMessage.text}
          </div>
        )}

        <div className="card mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select className="input select w-48" value={filters.division} onChange={e => setFilters(prev => ({ ...prev, division: e.target.value }))}>
              <option value="">全部門</option>
              {DIVISIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className="input select w-32" value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}>
              <option value="">全ステータス</option>
              {PROJECT_STATUS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input select w-32" value={filters.owner} onChange={e => setFilters(prev => ({ ...prev, owner: e.target.value }))}>
              <option value="">全担当者</option>
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: COLORS.textMuted }}>並び替え:</span>
              {(['name', 'date', 'revenue', 'profit'] as SortKey[]).map(key => (
                <button key={key} onClick={() => toggleSort(key)} className={`px-2 py-1 text-xs rounded ${sortKey === key ? 'bg-gray-100' : ''}`} style={{ color: sortKey === key ? COLORS.green : COLORS.textSecondary }}>
                  {{ name: '名前', date: '日付', revenue: '売上', profit: '利益' }[key]}
                  {sortKey === key && (sortAsc ? ' ↑' : ' ↓')}
                </button>
              ))}
            </div>
            <div className="flex items-center border rounded" style={{ borderColor: COLORS.border }}>
              <button onClick={() => setViewMode('card')} className="p-2" style={{ background: viewMode === 'card' ? 'rgba(27,77,62,0.1)' : 'transparent', color: viewMode === 'card' ? COLORS.green : COLORS.textMuted }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              </button>
              <button onClick={() => setViewMode('list')} className="p-2" style={{ background: viewMode === 'list' ? 'rgba(27,77,62,0.1)' : 'transparent', color: viewMode === 'list' ? COLORS.green : COLORS.textMuted }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="2" rx="1" /><rect x="3" y="11" width="18" height="2" rx="1" /><rect x="3" y="18" width="18" height="2" rx="1" /></svg>
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs" style={{ color: COLORS.textMuted }}>{filteredProjects.length}件のプロジェクト</div>
        </div>

        {viewMode === 'card' && (
          <div className="grid grid-cols-2 gap-4">
            {filteredProjects.map(p => (
              <div key={p.id} className="relative group">
                <ProjectCard project={p} stats={projectStats[p.id] || { revenue: 0, expense: 0 }} onClick={() => handleEdit(p)} />
                <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p.id); }} className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50" style={{ color: COLORS.crimson }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="card overflow-hidden p-0">
            <table className="table">
              <thead>
                <tr><th>プロジェクト</th><th>部門</th><th>担当</th><th>ステータス</th><th className="text-right">売上</th><th className="text-right">経費</th><th className="text-right">利益</th><th className="text-right">ROI</th><th className="text-right">利益率</th><th></th></tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => {
                  const stats = projectStats[p.id] || { revenue: 0, expense: 0 };
                  const profit = stats.revenue - stats.expense;
                  const roi = stats.expense > 0 ? (profit / stats.expense) * 100 : 0;
                  const margin = stats.revenue > 0 ? (profit / stats.revenue) * 100 : 0;
                  const div = getDivision(p.division);
                  const status = getStatus(p.status);
                  const owner = getUser(p.owner);
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={() => handleEdit(p)}>
                      <td className="font-medium">{p.name}</td>
                      <td><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: div?.color }} />{div?.abbr}</div></td>
                      <td>{owner?.name}</td>
                      <td><span className="badge" style={{ background: `${status?.color}15`, color: status?.color }}>{status?.name}</span></td>
                      <td className="text-right font-number" style={{ color: COLORS.gold }}>{formatYen(stats.revenue)}</td>
                      <td className="text-right font-number" style={{ color: COLORS.crimson }}>{formatYen(stats.expense)}</td>
                      <td className="text-right font-number" style={{ color: profit >= 0 ? COLORS.green : COLORS.crimson }}>{formatYen(profit)}</td>
                      <td className="text-right font-number tooltip" data-tooltip="利益÷経費×100" style={{ color: roi >= 100 ? COLORS.green : COLORS.textSecondary }}>{stats.expense > 0 ? formatPercent(roi) : '—'}</td>
                      <td className="text-right font-number tooltip" data-tooltip="利益÷売上×100" style={{ color: margin >= 50 ? COLORS.green : COLORS.textSecondary }}>{stats.revenue > 0 ? formatPercent(margin) : '—'}</td>
                      <td><button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p.id); }} className="p-1 rounded hover:bg-red-50" style={{ color: COLORS.crimson }}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredProjects.length === 0 && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>プロジェクトがありません</div>}
          </div>
        )}

        {filteredProjects.length === 0 && viewMode === 'card' && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>プロジェクトがありません</div>}
      </main>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingProject(undefined); }} title={editingProject ? 'プロジェクトを編集' : 'プロジェクトを追加'}>
        <ProjectForm project={editingProject} currentUser={currentUser} onSubmit={handleSubmit} onCancel={() => { setIsModalOpen(false); setEditingProject(undefined); }} />
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="プロジェクトを削除">
        <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>このプロジェクトを削除しますか？紐付いた取引は残りますが、プロジェクト参照は解除されます。</p>
        <div className="flex gap-2">
          <button className="btn flex-1" style={{ background: COLORS.crimson, color: 'white' }} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>削除</button>
          <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>キャンセル</button>
        </div>
      </Modal>
    </div>
  );
}
