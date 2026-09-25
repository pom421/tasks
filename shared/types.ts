// Types échangés entre le serveur et le front (réponses de l'API).

export interface Task {
  id: number;
  project_id: number;
  title: string;
  jira_at: string | null; // horodatage du report dans Jira, null = non reportée
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
}

export interface Journal {
  days: JournalDay[];
}

export interface JournalFilter {
  from?: string;
  to?: string;
  projectId?: number;
}

export interface ImportResult {
  projects: number;
  tasks: number;
}
