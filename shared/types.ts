// Types échangés entre le serveur et le front (réponses de l'API).
// Types des lignes : déduits du schéma de la base (import de types seulement,
// rien de Drizzle n'arrive dans le front).
import type { ProjectRow, TaskRow } from '../server/schema.ts';

// Suivi Jira : rien -> à reporter (jira_wanted_at) -> reportée (jira_at).
export type JiraState = 'none' | 'wanted' | 'done';

// Tâche à faire telle que l'API la renvoie : colonnes de la table task
// (sens de chaque colonne : server/schema.ts), sans la date de fin, l'ordre et
// la date de création.
export type Task = Omit<TaskRow, 'done_at' | 'position' | 'created_at'>;

// Chrono : lancer, mettre en pause, arrêter et remettre à zéro.
export type TimerAction = 'start' | 'pause' | 'reset';

// Temps passé en secondes, période en cours comprise.
export function timeSpent(t: Pick<Task, 'time_spent' | 'timer_started_at'>, now = Date.now()): number {
  if (!t.timer_started_at) return t.time_spent;
  const start = Date.parse(t.timer_started_at.replace(' ', 'T') + 'Z');
  return t.time_spent + Math.max(0, Math.floor((now - start) / 1000));
}

// « 12 min », puis « 2h34 » à partir d'une heure.
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Settings {
  jira_base_url: string | null; // ex. https://entreprise.atlassian.net
  day_capacity: number; // Plan journée : nombre de tâches maximum
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

export interface Project extends Pick<ProjectRow, 'id' | 'name' | 'archived_at' | 'favorite_at'> {
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
  dates: string[]; // jours ayant des entrées qui correspondent aux filtres, triés
}

export interface JournalFilter {
  from?: string;
  to?: string;
  projectId?: number;
  jiraPending?: boolean; // seulement les tâches à reporter dans Jira
  q?: string; // recherche : titre, contenu, ticket
  limit?: number; // les N derniers jours ayant des entrées jusqu'à `to`
}

export interface ImportResult {
  projects: number;
  tasks: number;
}
