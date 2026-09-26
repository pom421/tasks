// Types échangés entre le serveur et le front (réponses de l'API).

// Suivi Jira : rien -> à reporter (jira_wanted_at) -> reportée (jira_at).
export type JiraState = 'none' | 'wanted' | 'done';

export interface Task {
  id: number;
  project_id: number;
  title: string;
  jira_wanted_at: string | null; // marquée « à reporter dans Jira »
  jira_at: string | null; // reportée dans Jira
  jira_key: string | null; // clé du ticket (PROJ-123), lien construit avec l'URL Jira d'entreprise
  jira_url: string | null; // ou lien complet vers le ticket (http/https)
  notes: string | null; // détails, en Markdown
  day_at: string | null; // choisie pour la journée du 'YYYY-MM-DD' (Ma journée)
}

export interface Settings {
  jira_base_url: string | null; // ex. https://entreprise.atlassian.net
  day_capacity: number; // Ma journée : nombre de tâches maximum
}

export const DEFAULT_DAY_CAPACITY = 5;

// Lien du ticket : URL complète, sinon clé + URL Jira d'entreprise.
export function jiraLink(t: Pick<Task, 'jira_key' | 'jira_url'>, settings: Settings): string | null {
  if (t.jira_url) return t.jira_url;
  if (t.jira_key && settings.jira_base_url) return `${settings.jira_base_url}/browse/${t.jira_key}`;
  return null;
}

export const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

export const hasDetails = (t: Pick<Task, 'notes'>) => Boolean(t.notes);

export function jiraState(t: Pick<Task, 'jira_wanted_at' | 'jira_at'>): JiraState {
  if (t.jira_at) return 'done';
  return t.jira_wanted_at ? 'wanted' : 'none';
}

export interface Project {
  id: number;
  name: string;
  archived_at: string | null;
  favorite_at: string | null;
  tasks: Task[]; // tâches à faire uniquement
}

export interface DoneTask extends Task {
  done_at: string; // 'YYYY-MM-DD'
  project_name: string;
}

export interface JournalDay {
  date: string; // 'YYYY-MM-DD'
  tasks: DoneTask[];
}

export interface State {
  projects: Project[];
  jiraPending: number; // tâches à reporter dans Jira (à faire ou faites)
  dayDone: number; // tâches faites parmi celles choisies pour la journée demandée
  settings: Settings;
}

export interface Journal {
  days: JournalDay[];
  dates: string[]; // jours ayant des tâches faites (du projet filtré), triés
}

export interface JournalFilter {
  from?: string;
  to?: string;
  projectId?: number;
  jiraPending?: boolean; // seulement les tâches à reporter dans Jira
  q?: string; // recherche : titre, contenu, ticket
}

export interface ImportResult {
  projects: number;
  tasks: number;
}
