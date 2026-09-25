import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { jiraState, type JournalDay, type Project, type Settings, type Task } from '../shared/types.ts';
import { api } from '@/lib/api';
import { ActionsContext, type Actions, type TaskField, type Undo } from '@/lib/actions';
import { focusByKey, handleNavKey, restore, snapshot, type FocusSnapshot } from '@/lib/nav';
import { Toolbar } from '@/components/Toolbar';
import { ProjectList } from '@/components/ProjectList';
import { Journal, NO_FILTER, journalQuery, type Filter } from '@/components/Journal';
import { TaskDialog } from '@/components/TaskDialog';
import { SettingsPage } from '@/components/SettingsPage';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Data {
  projects: Project[];
  days: JournalDay[];
  settings: Settings;
  dates: string[]; // jours du Log ayant des entrées
}

// Focus à appliquer une fois les nouvelles données affichées.
interface PendingFocus {
  snap: FocusSnapshot | null;
  stay: boolean;
  key?: string;
  applied: () => void; // termine l'action une fois le focus appliqué
}

export function App() {
  const [data, setData] = useState<Data>({ projects: [], days: [], settings: { jira_base_url: null }, dates: [] });
  // Deux « pages » seulement : la liste (/) et les réglages (/admin), sans routeur.
  const [path, setPath] = useState(window.location.pathname);
  // Fiche d'une tâche : id, champ focalisé, open à false pendant l'animation de
  // fermeture ; opening numérote les ouvertures (formulaire neuf à chaque fois).
  const [openTask, setOpenTask] = useState<{ id: number; field: TaskField; open: boolean; opening: number } | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  // Filtres de la zone des projets (boutons sous la barre d'outils) : sans effet sur le Log.
  const [jiraOnly, setJiraOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filterRef = useRef(filter);
  // Actions en attente d'affichage. Plusieurs peuvent se chevaucher (fermer la
  // fiche puis J aussitôt) : aucune n'est perdue, la plus récente décide du focus.
  const pending = useRef<PendingFocus[]>([]);
  const lastProject = useRef<number | null>(null);
  const lastUndo = useRef<Undo | null>(null);

  const toast = useCallback((msg: string) => setMessage(msg), []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const load = useCallback(async (f: Filter = filterRef.current) => {
    const [state, journal] = await Promise.all([
      api.state(),
      api.journal(journalQuery(f)),
    ]);
    setData({
      projects: state.projects,
      days: journal.days,
      settings: state.settings,
      dates: journal.dates,
    });
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
    setUndo: (undo) => (lastUndo.current = undo),
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
        const entry = { snap: snapshot(), stay, key: (result as { focus?: string } | undefined)?.focus, applied };
        pending.current.push(entry);
        load().catch((err) => {
          toast(err.message);
          pending.current = pending.current.filter((p) => p !== entry);
          applied();
        });
      });
    },
  };

  // Restaure le focus clavier après chaque rechargement des données.
  useLayoutEffect(() => {
    const all = pending.current;
    const p = all.at(-1);
    if (!p) return;
    pending.current = [];
    if (p.key) focusByKey(p.key);
    else restore(p.snap, { stay: p.stay });
    for (const entry of all) entry.applied();
  }, [data]);

  const changeFilter = (f: Filter) => {
    filterRef.current = f;
    setFilter(f);
    load(f).catch((err) => toast(err.message));
  };

  // u : annule la dernière action (cocher, renommer, supprimer), une seule fois.
  // Les modifications faites dans la fiche ne sont pas annulables.
  const undo = () => {
    const last = lastUndo.current;
    lastUndo.current = null;
    if (!last) return toast('Rien à annuler');
    actions.act(async () => {
      await last.run();
      toast(`Annulé : ${last.label}`);
      return { focus: last.focus };
    });
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
        d: () => document.getElementById('filter-date')?.focus(),
        f: () => document.getElementById('filter-project')?.focus(),
        '/': () => document.getElementById('log-search')?.focus(),
        r: () => setJiraOnly((v) => !v),
        '*': () => setFavoritesOnly((v) => !v),
        u: undo,
        '?': () => setHelpOpen(true),
        // Échap (hors élément de la liste) : réinitialise les filtres du Log.
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

  // Projets affichés selon « Archivés » (seulement les archivés, ou seulement
  // les autres) : base des compteurs des boutons à reporter et Favoris.
  const visibleProjects = data.projects.filter((p) => Boolean(p.archived_at) === archivedOnly);

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
          jiraPending={visibleProjects.flatMap((p) => p.tasks).filter((t) => jiraState(t) === 'wanted').length}
          jiraFilter={jiraOnly}
          onJiraFilter={() => setJiraOnly((v) => !v)}
          favorites={visibleProjects.filter((p) => p.favorite_at).length}
          favoritesOnly={favoritesOnly}
          onFavoritesOnly={() => setFavoritesOnly((v) => !v)}
          archived={data.projects.filter((p) => p.archived_at).length}
          archivedOnly={archivedOnly}
          onArchivedOnly={() => setArchivedOnly((v) => !v)}
          helpOpen={helpOpen}
          onHelpOpen={setHelpOpen}
        />
        <main>
          <ProjectList projects={data.projects} archivedOnly={archivedOnly} jiraOnly={jiraOnly} favoritesOnly={favoritesOnly} />
          <Journal days={data.days} dates={data.dates} projects={data.projects} filter={filter} onFilter={changeFilter} />
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
