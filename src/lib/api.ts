import type { ImportResult, JiraState, Journal, JournalFilter, Settings, State } from '../../shared/types.ts';

// Le serveur exige un Content-Type précis par route (protection CSRF).
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  const headers = init.headers as Record<string, string>;
  if (body instanceof Blob) {
    headers['Content-Type'] = 'application/octet-stream';
    init.body = body;
  } else if (typeof body === 'string') {
    headers['Content-Type'] = 'text/markdown';
    init.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data as T;
}

export interface TaskPatch {
  title?: string;
  done?: boolean;
  done_at?: string;
  jira?: JiraState;
  jira_ticket?: string | null; // clé (PROJ-123) ou lien complet
  notes?: string | null;
}

export const api = {
  state: () => request<State>('GET', '/api/state'),
  settings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('PUT', '/api/settings', patch),
  journal: ({ from, to, projectId, jiraPending, q }: JournalFilter) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (projectId) params.set('project', String(projectId));
    if (jiraPending) params.set('jira', 'pending');
    if (q) params.set('q', q);
    return request<Journal>('GET', `/api/journal?${params}`);
  },
  createProject: (name: string) => request<{ id: number }>('POST', '/api/projects', { name }),
  updateProject: (id: number, patch: { name?: string; archived?: boolean; favorite?: boolean }) =>
    request('PATCH', `/api/projects/${id}`, patch),
  deleteProject: (id: number) => request('DELETE', `/api/projects/${id}`),
  createTask: (projectId: number, title: string) => request('POST', '/api/tasks', { project_id: projectId, title }),
  updateTask: (id: number, patch: TaskPatch) => request('PATCH', `/api/tasks/${id}`, patch),
  moveProject: (id: number, index: number) => request('POST', `/api/projects/${id}/move`, { index }),
  moveTask: (id: number, projectId: number, index: number) =>
    request('POST', `/api/tasks/${id}/move`, { project_id: projectId, index }),
  // Renvoie la tâche supprimée (toutes ses colonnes), à passer à restoreTask pour annuler.
  deleteTask: (id: number) => request<Record<string, unknown>>('DELETE', `/api/tasks/${id}`),
  restoreTask: (row: Record<string, unknown>) => request('POST', '/api/tasks/restore', row),
  importDb: (file: Blob) => request('POST', '/api/import', file),
  importMarkdown: (text: string) => request<ImportResult>('POST', '/api/import-markdown', text),
};
