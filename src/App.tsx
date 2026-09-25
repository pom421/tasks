import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JournalDay, Project, Settings, Task } from '../shared/types.ts';
import { api } from '@/lib/api';
import { ActionsContext, type Actions, type TaskField } from '@/lib/actions';
import { focusByKey, handleNavKey, restore, snapshot, type FocusSnapshot } from '@/lib/nav';
import { Toolbar } from '@/components/Toolbar';
import { ProjectList } from '@/components/ProjectList';
import { Journal, NO_FILTER, type Filter } from '@/components/Journal';
import { TaskDialog } from '@/components/TaskDialog';
import { SettingsPage } from '@/components/SettingsPage';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Data {
  projects: Project[];
  days: JournalDay[];
  jiraPending: number;
  settings: Settings;
}

// Focus à appliquer une fois les nouvelles données affichées.
interface PendingFocus {
  snap: FocusSnapshot | null;
  stay: boolean;
  key?: string;
  applied: () => void; // termine l'action une fois le focus appliqué
}

export function App() {
  const [data, setData] = useState<Data>({ projects: [], days: [], jiraPending: 0, settings: { jira_base_url: null } });
  // Deux « pages » seulement : la liste (/) et les réglages (/admin), sans routeur.
  const [path, setPath] = useState(window.location.pathname);
  // Fiche d'une tâche : id, champ focalisé, open à false pendant l'animation de
  // fermeture ; opening numérote les ouvertures (formulaire neuf à chaque fois).
  const [openTask, setOpenTask] = useState<{ id: number; field: TaskField; open: boolean; opening: number } | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [showArchived, setShowArchived] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filterRef = useRef(filter);
  const pending = useRef<PendingFocus | null>(null);
  const lastProject = useRef<number | null>(null);

  const toast = useCallback((msg: string) => setMessage(msg), []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const load = useCallback(async (f: Filter = filterRef.current) => {
    const [state, journal] = await Promise.all([
      api.state(),
      api.journal({ from: f.from, to: f.to, projectId: Number(f.project) || undefined, jiraPending: f.jira }),
    ]);
    setData({ projects: state.projects, days: journal.days, jiraPending: state.jiraPending, settings: state.settings });
  }, []);

  // Rechargé à chaque retour sur la liste (les réglages ont pu changer).
  useEffect(() => {
    if (path === '/admin') return;
    load().catch((err) => toast(err.message));
  }, [load, toast, path]);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
  }, []);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const actions: Actions = {
    toast,
    settings: data.settings,
    navigate,
    openTask: (task, field = 'notes') =>
      setOpenTask((o) => ({ id: task.id, field, open: true, opening: (o?.opening ?? 0) + 1 })),
    setLastProject: (id) => (lastProject.current = id),
    act: async (fn, { stay = false } = {}) => {
      let result: unknown;
      try {
        result = await fn();
      } catch (err) {
        toast((err as Error).message);
      }
      // Après fn (qui a pu vider un champ d'ajout), juste avant le re-rendu.
      // act ne se termine qu'une fois les données affichées et le focus
      // restauré : ce que l'appelant fait ensuite (ouvrir un champ…) n'est
      // plus écrasé par la restauration.
      await new Promise<void>((applied) => {
        pending.current = { snap: snapshot(), stay, key: (result as { focus?: string } | undefined)?.focus, applied };
        load().catch((err) => {
          toast(err.message);
          pending.current = null;
          applied();
        });
      });
    },
  };

  // Restaure le focus clavier après chaque rechargement des données.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.key) focusByKey(p.key);
    else restore(p.snap, { stay: p.stay });
    p.applied();
  }, [data]);

  const changeFilter = (f: Filter) => {
    filterRef.current = f;
    setFilter(f);
    load(f).catch((err) => toast(err.message));
  };

  // Navigation (↑/↓…) et raccourcis globaux, hors champs de saisie.
  useEffect(() => {
    if (path === '/admin') return;
    const onKey = (e: KeyboardEvent) => {
      handleNavKey(e);
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, [role="dialog"]')) return;
      const focusAdd = () => {
        const inputs = [...document.querySelectorAll<HTMLInputElement>('#projects input.add')];
        (inputs.find((i) => i.dataset.navKey === `add:${lastProject.current}`) ?? inputs[0])?.focus();
      };
      const keys: Record<string, () => void> = {
        p: () => document.getElementById('new-project')?.focus(),
        n: focusAdd,
        d: () => document.getElementById('filter-from')?.focus(),
        f: () => document.getElementById('filter-project')?.focus(),
        r: () => changeFilter({ ...filterRef.current, jira: !filterRef.current.jira }),
        '?': () => setHelpOpen(true),
        // Échap sur un élément de la liste : on reste en navigation.
        Escape: () => target.dataset.nav === undefined && changeFilter(NO_FILTER),
      };
      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Tâche ouverte dans la fiche : relue dans les données à jour (liste ou journal).
  const allTasks: (Task & { project_name?: string })[] = [
    ...data.projects.flatMap((p) => p.tasks),
    ...data.days.flatMap((d) => d.tasks),
  ];
  const current = openTask && allTasks.find((t) => t.id === openTask.id);
  const projectName = (t: Task & { project_name?: string }) =>
    t.project_name ?? data.projects.find((p) => p.id === t.project_id)?.name ?? '';

  if (path === '/admin') {
    return <SettingsPage onBack={() => navigate('/')} />;
  }

  return (
    <ActionsContext.Provider value={actions}>
      <TooltipProvider>
      {current && (
        <TaskDialog
          key={openTask.opening}
          task={current}
          projectName={projectName(current)}
          field={openTask.field}
          open={openTask.open}
          onClose={(changed) => {
            setOpenTask({ ...openTask, open: false });
            if (changed) actions.act(async () => ({ focus: `task:${current.id}` }));
          }}
        />
      )}
      <div className="mx-auto max-w-2xl px-4">
        <Toolbar
          jiraPending={data.jiraPending}
          jiraFilter={filter.jira}
          onJiraFilter={() => changeFilter({ ...filter, jira: !filter.jira })}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          helpOpen={helpOpen}
          onHelpOpen={setHelpOpen}
        />
        <main>
          <ProjectList projects={data.projects} showArchived={showArchived} jiraOnly={filter.jira} />
          <Journal days={data.days} projects={data.projects} filter={filter} onFilter={changeFilter} />
        </main>
      </div>
      {message && (
        <div id="toast" role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-1.5 text-sm text-background">
          {message}
        </div>
      )}
      </TooltipProvider>
    </ActionsContext.Provider>
  );
}
