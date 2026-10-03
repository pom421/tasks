import type { ImportResult, BugtrackerState, JiraFields, Priority, TimerAction, Journal, JournalFilter, Settings, SettingsPatch, State } from '../../shared/types.ts';

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
  bugtracker?: BugtrackerState;
  bugtracker_ticket?: string | null; // identifiant (PROJ-123)
  notes?: string | null;
  timer?: TimerAction;
  time_spent?: number; // annulation du chrono
  timer_started_at?: string | null;
  day_at?: string | null; // date prévue (Aujourd’hui si c'est ce jour), null = aucune
  due_at?: string | null; // échéance, null = aucune
  sprint?: string | null; // nom du sprint, null = aucun
  tags?: string[]; // liste complète
  priority?: Priority | null;
}

export const api = {
  state: (day: string) => request<State>('GET', `/api/state?day=${day}`),
  settings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (patch: SettingsPatch) => request<Settings>('PUT', '/api/settings', patch),
  journal: ({ from, to, projectId, bugtrackerPending, q, tags, limit }: JournalFilter) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (projectId) params.set('project', String(projectId));
    if (bugtrackerPending) params.set('bugtracker', 'pending');
    if (q) params.set('q', q);
    if (tags?.length) params.set('tags', tags.join(','));
    if (limit) params.set('limit', String(limit));
    return request<Journal>('GET', `/api/journal?${params}`);
  },
  createProject: (name: string) => request<{ id: number }>('POST', '/api/projects', { name }),
  updateProject: (id: number, patch: { name?: string; archived?: boolean; favorite?: boolean; bugtracker_ticket?: string | null }) =>
    request('PATCH', `/api/projects/${id}`, patch),
  // Renvoie le projet supprimé et ses tâches, à passer à restoreProject pour annuler.
  deleteProject: (id: number) => request<Record<string, unknown>>('DELETE', `/api/projects/${id}`),
  restoreProject: (deleted: Record<string, unknown>) => request('POST', '/api/projects/restore', deleted),
  createTask: (projectId: number, title: string) => request('POST', '/api/tasks', { project_id: projectId, title }),
  updateTask: (id: number, patch: TaskPatch) => request('PATCH', `/api/tasks/${id}`, patch),
  moveProject: (id: number, index: number) => request('POST', `/api/projects/${id}/move`, { index }),
  moveTask: (id: number, projectId: number, index: number) =>
    request('POST', `/api/tasks/${id}/move`, { project_id: projectId, index }),
  // Renvoie la tâche supprimée (toutes ses colonnes), à passer à restoreTask pour annuler.
  deleteTask: (id: number) => request<Record<string, unknown>>('DELETE', `/api/tasks/${id}`),
  restoreTask: (row: Record<string, unknown>) => request('POST', '/api/tasks/restore', row),
  // Ticket Jira (clé PROJ-123) : lecture et écriture des champs synchronisés.
  jiraIssue: (key: string) => request<JiraFields>('GET', `/api/jira/${key}`),
  updateJiraIssue: (key: string, fields: JiraFields) => request('PUT', `/api/jira/${key}`, fields),
  importDb: (file: Blob) => request('POST', '/api/import', file),
  importMarkdown: (text: string) => request<ImportResult>('POST', '/api/import-markdown', text),
};
