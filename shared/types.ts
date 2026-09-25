// Types échangés entre le serveur et le front (réponses de l'API).

// Suivi Jira : rien -> à reporter (jira_wanted_at) -> reportée (jira_at).
export type JiraState = 'none' | 'wanted' | 'done';

export interface Task {
  id: number;
  project_id: number;
  title: string;
  jira_wanted_at: string | null; // marquée « à reporter dans Jira »
  jira_at: string | null; // reportée dans Jira
  jira_url: string | null; // lien vers le ticket (http/https)
}

export function jiraState(t: Pick<Task, 'jira_wanted_at' | 'jira_at'>): JiraState {
  if (t.jira_at) return 'done';
  return t.jira_wanted_at ? 'wanted' : 'none';
}

export interface Project {
  id: number;
  name: string;
  archived_at: string | null;
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
}

export interface Journal {
  days: JournalDay[];
}

export interface JournalFilter {
  from?: string;
  to?: string;
  projectId?: number;
  jiraPending?: boolean; // seulement les tâches à reporter dans Jira
}

export interface ImportResult {
  projects: number;
  tasks: number;
}
