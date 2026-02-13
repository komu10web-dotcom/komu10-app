'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// 型定義
interface Project {
  id: string;
  name: string;
  division: string;
  owner: string;
  status: string;
  client?: string;
  youtube_id?: string;
  category?: string;
  location?: string;
  shoot_date?: string;
  publish_date?: string;
  budget?: number;
  target_revenue?: number;
  note?: string;
  tags?: string[];
  external_id?: string;
  created_at: string;
  updated_at: string;
}

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

// 部門ラベル
const DIVISION_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  data: 'データ事業',
  design: '事業設計',
  photo: 'THIS PLACE',
};

// ステータスラベル
const STATUS_LABELS: Record<string, string> = {
  ordered: '受注',
  active: '進行中',
  completed: '完了',
};

// 金額フォーマット
const formatYen = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filterDivision, setFilterDivision] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const supabase = createClient();

  // プロジェクト取得
  const fetchProjects = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (filterDivision) {
        query = query.eq('division', filterDivision);
      }
      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('プロジェクト取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [filterDivision, filterStatus]);

  // GAS同期（Supabaseに保存）
  const handleSync = async () => {
    // localStorageからGAS URLを取得
    const gasUrl = localStorage.getItem('gas_api_url');
    
    if (!gasUrl) {
      setSyncMessage({ type: 'error', text: '設定ページでGAS URLを設定してください' });
      return;
    }
    
    setSyncing(true);
    setSyncMessage(null);
    
    try {
      // GASからデータ取得
      const response = await fetch(gasUrl);
      if (!response.ok) throw new Error('GASからの取得に失敗しました');
      
      const data: GASResponse = await response.json();
      
      if (!data.projects || data.projects.length === 0) {
        setSyncMessage({ type: 'error', text: 'プロジェクトデータがありません' });
        return;
      }
      
      // 現在のユーザーを取得（Cookieから）
      const owner = document.cookie
        .split('; ')
        .find(row => row.startsWith('current_user='))
        ?.split('=')[1] || 'tomo';
      
      let insertedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      
      // 各プロジェクトをSupabaseにUPSERT
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
        
        // external_idで既存チェック
        const { data: existing } = await supabase
          .from('projects')
          .select('id')
          .eq('external_id', gasProject.externalId)
          .single();
        
        if (existing) {
          // 更新
          const { error } = await supabase
            .from('projects')
            .update(projectData)
            .eq('id', existing.id);
          
          if (error) {
            console.error('更新エラー:', error);
            errorCount++;
          } else {
            updatedCount++;
          }
        } else {
          // 新規挿入
          const { error } = await supabase
            .from('projects')
            .insert(projectData);
          
          if (error) {
            console.error('挿入エラー:', error);
            errorCount++;
          } else {
            insertedCount++;
          }
        }
      }
      
      // 結果メッセージ
      const messages = [];
      if (insertedCount > 0) messages.push(`${insertedCount}件追加`);
      if (updatedCount > 0) messages.push(`${updatedCount}件更新`);
      if (errorCount > 0) messages.push(`${errorCount}件エラー`);
      
      setSyncMessage({
        type: errorCount > 0 ? 'error' : 'success',
        text: messages.length > 0 ? messages.join('、') : '同期完了（変更なし）',
      });
      
      // プロジェクト一覧を再取得
      await fetchProjects();
      
    } catch (error) {
      console.error('同期エラー:', error);
      setSyncMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '同期に失敗しました',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">プロジェクト</h1>
        <div className="flex gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                同期中...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                スプレッドシート同期
              </>
            )}
          </button>
          <Link
            href="/projects/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + 新規プロジェクト
          </Link>
        </div>
      </div>

      {/* 同期メッセージ */}
      {syncMessage && (
        <div className={`mb-4 p-3 rounded-lg ${
          syncMessage.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {syncMessage.text}
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-4 mb-6">
        <select
          value={filterDivision}
          onChange={(e) => setFilterDivision(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-white"
        >
          <option value="">すべての部門</option>
          {Object.entries(DIVISION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-white"
        >
          <option value="">すべてのステータス</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* ローディング */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <svg className="animate-spin h-8 w-8 text-gray-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">プロジェクトがありません</p>
          <p className="text-sm">「スプレッドシート同期」または「新規プロジェクト」で追加してください</p>
        </div>
      ) : (
        /* プロジェクト一覧 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block p-4 bg-white rounded-lg border hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <h2 className="font-semibold text-lg line-clamp-2">{project.name}</h2>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  project.status === 'completed' 
                    ? 'bg-gray-100 text-gray-600' 
                    : project.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {STATUS_LABELS[project.status] || project.status}
                </span>
              </div>
              
              <div className="flex gap-2 mb-3">
                <span className={`px-2 py-1 text-xs rounded ${
                  project.division === 'youtube' ? 'bg-red-100 text-red-700' :
                  project.division === 'data' ? 'bg-purple-100 text-purple-700' :
                  project.division === 'design' ? 'bg-orange-100 text-orange-700' :
                  'bg-teal-100 text-teal-700'
                }`}>
                  {DIVISION_LABELS[project.division] || project.division}
                </span>
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                  {project.owner}
                </span>
              </div>
              
              {project.publish_date && (
                <p className="text-sm text-gray-500">
                  公開日: {new Date(project.publish_date).toLocaleDateString('ja-JP')}
                </p>
              )}
              
              {project.budget && (
                <p className="text-sm text-gray-500">
                  予算: {formatYen(project.budget)}
                </p>
              )}
              
              {project.external_id && (
                <p className="text-xs text-gray-400 mt-2">
                  ID: {project.external_id}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
