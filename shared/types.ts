// Types échangés entre le serveur et le front (réponses de l'API).
// Types des lignes : déduits du schéma de la base (import de types seulement,
// rien de Drizzle n'arrive dans le front).
import type { ProjectRow, TaskRow } from '../server/schema.ts';

// Suivi du bugtracker : rien -> à reporter (bugtracker_wanted_at) -> reportée (bugtracker_at).
export type BugtrackerState = 'none' | 'wanted' | 'done';

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

// Tag saisi (« #Client Web ») ramené à sa forme enregistrée (« client-web ») ;
// null s'il est vide ou contient autre chose que lettres, chiffres, - et _.
export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-');
  return /^[\p{L}\p{N}_-]{1,30}$/u.test(tag) ? tag : null;
}

// Tous les tags des tâches, triés (autocomplétion).
export const allTags = (tasks: Pick<Task, 'tags'>[]) => [...new Set(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'fr'));

export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Settings {
  bugtracker_base_url: string | null; // ex. https://entreprise.tickets.fr
  day_capacity: number; // Plan journée : nombre de tâches maximum
  jira_pat_set: boolean; // PAT Jira enregistré (sa valeur ne quitte jamais le serveur)
}

// Modification des réglages : le PAT s'écrit mais ne se relit pas.
export type SettingsPatch = Partial<Omit<Settings, 'jira_pat_set'>> & { jira_pat?: string | null };

// Champs d'une tâche synchronisés avec un ticket Jira (titre ↔ summary,
// contenu ↔ description, échéance ↔ duedate).
export interface JiraFields {
  title: string;
  notes: string | null;
  due_at: string | null; // 'YYYY-MM-DD'
}

// Pousser / récupérer : possible avec un identifiant (PROJ-123), l'URL et le PAT.
export const jiraReady = (s: Settings) => Boolean(s.bugtracker_base_url && s.jira_pat_set);

export const DEFAULT_DAY_CAPACITY = 5;

// Lien du ticket : clé + URL du bugtracker.
export function bugtrackerLink(t: Pick<Task, 'bugtracker_key'>, settings: Settings): string | null {
  if (t.bugtracker_key && settings.bugtracker_base_url) return `${settings.bugtracker_base_url}/browse/${t.bugtracker_key}`;
  return null;
}

export const BUGTRACKER_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
// Ticket saisi (fiche ou ligne) : identifiant (PROJ-123) ; vide = aucun.
export const isValidTicket = (s: string) => !s || BUGTRACKER_KEY_RE.test(s.toUpperCase());

export const hasDetails = (t: Pick<Task, 'notes'>) => Boolean(t.notes);

export function bugtrackerState(t: Pick<Task, 'bugtracker_wanted_at' | 'bugtracker_at'>): BugtrackerState {
  if (t.bugtracker_at) return 'done';
  return t.bugtracker_wanted_at ? 'wanted' : 'none';
}

export interface Project extends Pick<ProjectRow, 'id' | 'name' | 'archived_at' | 'favorite_at' | 'bugtracker_key' | 'notes'> {
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
  bugtrackerPending: number; // tâches à reporter dans le bugtracker (à faire ou faites)
  dayDone: number; // tâches faites parmi celles choisies pour la journée demandée
  settings: Settings;
}

export interface Journal {
  days: JournalDay[];
  dates: string[]; // jours ayant des entrées qui correspondent aux filtres, triés
  tags: string[]; // tags des tâches faites (propositions du filtre)
}

export interface JournalFilter {
  from?: string;
  to?: string;
  projectId?: number;
  bugtrackerPending?: boolean; // seulement les tâches à reporter dans le bugtracker
  q?: string; // recherche : titre, contenu, ticket
  tags?: string[]; // tâches portant tous ces tags
  limit?: number; // les N derniers jours ayant des entrées jusqu'à `to`
}

export interface ImportResult {
  projects: number;
  tasks: number;
}
