import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DIVISIONS, PROJECT_STATUSES } from '@/lib/constants';
import type { Project } from '@/lib/types';

async function getProjects(owner: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner', owner)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
  return data || [];
}

export default async function ProjectsPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const projects = await getProjects(currentUser);

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">プロジェクト</h2>
        <button className="px-4 py-2 bg-k10-gold text-white rounded-lg text-sm font-medium hover:bg-k10-gold/90 transition-colors">
          ＋ プロジェクト追加
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {projects.map((pj: Project) => {
          const division = DIVISIONS.find((d) => d.id === pj.division);
          const status = PROJECT_STATUSES.find((s) => s.id === pj.status);
          
          return (
            <div
              key={pj.id}
              className="bg-white rounded-xl p-5 border border-gray-100 hover:border-k10-gold/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-lg">{pj.name}</h3>
                  {pj.client && (
                    <p className="text-sm text-gray-500">{pj.client}</p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    pj.status === 'completed'
                      ? 'bg-gray-100 text-gray-600'
                      : pj.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {status?.label}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: division?.color || '#999' }}
                >
                  {division?.short}
                </span>
                {pj.category && (
                  <span className="text-xs text-gray-400">{pj.category}</span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  {pj.shoot_date ? formatDate(pj.shoot_date) : '日程未定'}
                </span>
                {pj.budget && (
                  <span className="font-saira">
                    予算: {formatCurrency(pj.budget)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {projects.length === 0 && (
          <div className="col-span-2 bg-white rounded-xl p-8 border border-gray-100 text-center text-gray-400">
            プロジェクトがありません
          </div>
        )}
      </div>
    </div>
  );
}
