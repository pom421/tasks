import { flushSync } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_DAY_CAPACITY, allTags, type BugtrackerState, type JournalDay, type Priority, type Project, type Settings, type Task } from '../shared/types.ts';
import { api } from '@/lib/api';
import { ActionsContext, type Actions, type TaskField } from '@/lib/actions';
import { record, useHistory } from '@/lib/history';
import { focusByKey, handleNavKey, restore, snapshot, type FocusSnapshot } from '@/lib/nav';
import { Toolbar } from '@/components/Toolbar';
import { ProjectFilters } from '@/components/ProjectFilters';
import { ProjectList } from '@/components/ProjectList';
import { Journal, NO_FILTER, journalQuery, type Filter } from '@/components/Journal';
import { TaskDialog } from '@/components/TaskDialog';
import { SettingsPage } from '@/components/SettingsPage';
import { DayView } from '@/components/DayView';
import { UpcomingView } from '@/components/UpcomingView';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Data {
  projects: Project[];
  days: JournalDay[];
  settings: Settings;
  dates: string[]; // jours du Log ayant des entrées
  logTags: string[]; // tags des tâches faites
  dayDone: number; // Aujourd’hui : tâches du plan déjà faites
}

// Focus à appliquer une fois les nouvelles données affichées.
interface PendingFocus {
  snap: FocusSnapshot | null;
  stay: boolean;
  key?: string;
  applied: () => void; // termine l'action une fois le focus appliqué
}

const NEXT_BUGTRACKER_FILTER: Record<BugtrackerState, BugtrackerState> = { none: 'wanted', wanted: 'done', done: 'none' };

export function App() {
  const [data, setData] = useState<Data>({
    projects: [],
    days: [],
    settings: { bugtracker_base_url: null, day_capacity: DEFAULT_DAY_CAPACITY },
    dates: [],
    logTags: [],
    dayDone: 0,
  });
  // Pages, sans routeur : quatre onglets, Projets (/), Aujourd’hui (/plan),
  // Prochainement (/prochainement) et Log (/log), et les réglages (/admin).
  const [path, setPath] = useState(window.location.pathname);
  const dayView = path === '/plan';
  const logView = path === '/log';
  const upcomingView = path === '/prochainement';
  const projectsView = !dayView && !logView && !upcomingView;
  // Onglets, dans l'ordre (Alt+← / Alt+→) ; P, T, L vont directement à l'un d'eux.
  const TABS: { label: string; to: string; key?: string; selected: boolean }[] = [
    { label: 'Projets', to: '/', key: 'P', selected: projectsView },
    { label: 'Aujourd’hui', to: '/plan', key: 'T', selected: dayView },
    { label: 'Prochainement', to: '/prochainement', selected: upcomingView },
    { label: 'Log', to: '/log', key: 'L', selected: logView },
  ];
  // Fiche d'une tâche : id, champ focalisé, open à false pendant l'animation de
  // fermeture ; opening numérote les ouvertures (formulaire neuf à chaque fois).
  const [openTask, setOpenTask] = useState<{ id: number; field: TaskField; open: boolean; opening: number } | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  // Filtres de la zone des projets (boutons sous la barre d'outils) : sans effet sur le Log.
  // Filtre report (R) : aucun → à reporter → reportées → aucun.
  const [bugtrackerFilter, setBugtrackerFilter] = useState<BugtrackerState>('none');
  const cycleBugtrackerFilter = () => setBugtrackerFilter((f) => NEXT_BUGTRACKER_FILTER[f]);
  const [archivedOnly, setArchivedOnly] = useState(false);
  // Filtre priorité (!) : aucun → 1 → 2 → 3 → aucun.
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  const cyclePriorityFilter = () => setPriorityFilter((p) => (p === 3 ? null : (((p ?? 0) + 1) as Priority)));
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Filtre par tags (#) : tâches portant tous ces tags.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filterRef = useRef(filter);
  // Actions en attente d'affichage. Plusieurs peuvent se chevaucher (fermer la
  // fiche puis J aussitôt) : aucune n'est perdue, la plus récente décide du focus.
  const pending = useRef<PendingFocus[]>([]);
  const lastProject = useRef<number | null>(null);
  // u / U en file : des appuis rapides s'enchaînent, chacun après l'affichage du précédent.
  const replaying = useRef(Promise.resolve());
  // Instant du dernier n : un 2e n rapproché (n n) ouvre « Nouveau projet ».
  const lastN = useRef(0);
  // Instant du dernier Échap : un 2e rapproché (Échap Échap) retire tous les filtres.
  const lastEscape = useRef(0);

  const toast = useCallback((msg: string) => setMessage(msg), []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const load = useCallback(async (f: Filter = filterRef.current) => {
    const [state, journal] = await Promise.all([
      api.state(localToday()),
      api.journal(journalQuery(f)),
    ]);
    setData({
      projects: state.projects,
      days: journal.days,
      settings: state.settings,
      dates: journal.dates,
      logTags: journal.tags,
      dayDone: state.dayDone,
    });
  }, []);

  // Curseur de chaque onglet (clé de navigation du dernier élément focalisé) :
  // retrouvé en revenant sur l'onglet.
  const tabFocus = useRef<Record<string, string>>({});
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const key = (e.target as HTMLElement).dataset?.navKey;
      if (key) tabFocus.current[window.location.pathname] = key;
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);
  useLayoutEffect(() => {
    const key = tabFocus.current[path];
    if (key) focusByKey(key);
  }, [path]);

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
    undoable: ({ label, focus, run, undo, redo = run, stay }) =>
      actions.act(
        async () => {
          const result = await run();
          record({ label, focus: typeof focus === 'string' ? focus : focus(), undo, redo });
          return result;
        },
        { stay },
      ),
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
    if (!p.key || !focusByKey(p.key)) restore(p.snap, { stay: p.stay });
    for (const entry of all) entry.applied();
  }, [data]);

  const changeFilter = (f: Filter) => {
    filterRef.current = f;
    setFilter(f);
    load(f).catch((err) => toast(err.message));
  };

  // u : annule la dernière action de l'historique, U la rejoue. Si l'opération
  // échoue (donnée modifiée ailleurs…), l'historique n'est plus fiable : vidé.
  const replay = (direction: 'undo' | 'redo') => {
    replaying.current = replaying.current.then(() => {
      const history = useHistory.getState();
      const entry = (direction === 'undo' ? history.past : history.future).at(-1);
      if (!entry) return toast(direction === 'undo' ? 'Rien à annuler' : 'Rien à rétablir');
      return actions.act(async () => {
        try {
          await entry[direction]();
        } catch (err) {
          history.clear();
          throw err;
        }
        if (direction === 'undo') history.undone();
        else history.redone();
        toast(`${direction === 'undo' ? 'Annulé' : 'Rétabli'} : ${entry.label}`);
        return { focus: entry.focus };
      });
    });
  };

  // Navigation (↑/↓…) et raccourcis globaux, hors champs de saisie.
  useEffect(() => {
    if (path === '/admin') return;
    const onKey = (e: KeyboardEvent) => {
      handleNavKey(e);
      const target = e.target as HTMLElement;
      // Champ « + Ajouter » en lecture (atteint par la navigation) : raccourcis actifs.
      if (e.defaultPrevented || target.closest('input:not([readonly]), select, textarea, [role="dialog"]')) return;
      // Alt+← / Alt+→ : onglet précédent / suivant (en boucle).
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const i = TABS.findIndex((t) => t.selected) + (e.key === 'ArrowLeft' ? -1 : 1);
        return navigate(TABS[(i + TABS.length) % TABS.length].to);
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // n : champ d'ajout du projet où est le curseur (projet ou une de ses
      // tâches), sinon du dernier projet utilisé, sinon du premier ; aucun
      // projet : « Nouveau projet ». Un 2e n rapproché : voir l'effet suivant.
      const focusAdd = () => {
        lastN.current = Date.now();
        const here = target.closest('#projects .project')?.id.replace('project-', '');
        const inputs = [...document.querySelectorAll<HTMLInputElement>('#projects input.add')];
        const find = (id: unknown) => inputs.find((i) => i.dataset.navKey === `add:${id}`);
        const field = find(here) ?? find(lastProject.current) ?? inputs[0] ?? document.getElementById('new-project');
        // Déjà dessus en lecture : on repasse par le focus pour écrire.
        if (field === document.activeElement) field?.blur();
        field?.focus();
      };
      // Champ du Log : passe d'abord dans l'onglet Log (affiché aussitôt).
      const focusLog = (id: string) => {
        if (!logView) flushSync(() => navigate('/log'));
        document.getElementById(id)?.focus();
      };
      const keys: Record<string, () => void> = {
        n: focusAdd,
        d: () => focusLog('filter-date'),
        '/': () => focusLog('log-search'),
        // Filtres de la zone des projets : seulement dans l'onglet Projets.
        R: () => projectsView && cycleBugtrackerFilter(),
        F: () => projectsView && setFavoritesOnly((v) => !v),
        A: () => projectsView && setArchivedOnly((v) => !v),
        '!': () => projectsView && cyclePriorityFilter(),
        ...Object.fromEntries(TABS.filter((t) => t.key).map((t) => [t.key, () => navigate(t.to)])),
        // Filtre par tags de l'onglet courant (Log ou Projets ; ailleurs : Projets).
        '#': () => {
          if (!logView && !projectsView) flushSync(() => navigate('/'));
          document.getElementById(logView ? 'log-tags' : 'project-tags')?.focus();
        },
        // Log : 5 jours précédents / suivants (bouton désactivé : sans effet).
        ArrowLeft: () => logView && document.getElementById('day-prev')?.click(),
        ArrowRight: () => logView && document.getElementById('day-next')?.click(),
        u: () => replay('undo'),
        U: () => replay('redo'),
        '?': () => setHelpOpen(true),
        // Échap (hors élément de la liste) : réinitialise les filtres du Log.
        // Échap Échap (rapprochés, où que soit le curseur hors champ) : tous les
        // filtres, projets et Log.
        Escape: () => {
          if (Date.now() - lastEscape.current < 800) {
            lastEscape.current = 0;
            setBugtrackerFilter('none');
            setPriorityFilter(null);
            setArchivedOnly(false);
            setFavoritesOnly(false);
            setTagFilter([]);
            changeFilter(NO_FILTER);
            return;
          }
          lastEscape.current = Date.now();
          if (target.dataset.nav === undefined) changeFilter(NO_FILTER);
        },
      };
      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // n n : nouveau projet. Le 1er n a placé le curseur dans un champ d'ajout de
  // tâche (encore vide) ; le 2e, rapproché, y est intercepté (phase de capture,
  // avant de s'écrire) et part sur « Nouveau projet ».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const field = e.target as HTMLInputElement;
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey || Date.now() - lastN.current > 800) return;
      if (!field.matches?.('#projects input.add') || field.value) return;
      e.preventDefault();
      e.stopPropagation();
      lastN.current = 0;
      document.getElementById('new-project')?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

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
          tagSuggestions={[...new Set([...allTags(data.projects.flatMap((p) => p.tasks)), ...data.logTags])].sort((a, b) => a.localeCompare(b, 'fr'))}
          open={openTask.open}
          onClose={(changed) => {
            setOpenTask({ ...openTask, open: false });
            if (changed) actions.act(async () => ({ focus: `task:${current.id}` }));
          }}
        />
      )}
      {/* Une colonne : un onglet à la fois (Projets, Aujourd’hui ou Log). */}
      <div className="mx-auto max-w-2xl px-4">
        <Toolbar helpOpen={helpOpen} onHelpOpen={setHelpOpen} />
        <main className="pb-16">
          <div className="min-w-0">
            <div role="tablist" aria-label="Vue" className="mt-3 flex h-[26px] items-center gap-4 lg:mt-5">
              {TABS.map((tab) => (
                <button
                  key={tab.to}
                  type="button"
                  role="tab"
                  aria-selected={tab.selected}
                  title={tab.key ? `${tab.label} (${tab.key})` : `${tab.label} (Alt+← / Alt+→)`}
                  className={cn(
                    'border-b-2 font-semibold',
                    tab.selected ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => navigate(tab.to)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Filtres de l'onglet Projets : sous les onglets, alignés à droite. */}
            {projectsView && (
              <ProjectFilters
                projects={data.projects}
                bugtrackerFilter={bugtrackerFilter}
                onBugtrackerFilter={cycleBugtrackerFilter}
                priorityFilter={priorityFilter}
                onPriorityFilter={cyclePriorityFilter}
                favoritesOnly={favoritesOnly}
                onFavoritesOnly={() => setFavoritesOnly((v) => !v)}
                archivedOnly={archivedOnly}
                onArchivedOnly={() => setArchivedOnly((v) => !v)}
                tagFilter={tagFilter}
                onTagFilter={setTagFilter}
              />
            )}
            {dayView && <DayView projects={data.projects} dayDone={data.dayDone} capacity={data.settings.day_capacity} />}
            {upcomingView && <UpcomingView projects={data.projects} />}
            {logView && <Journal days={data.days} dates={data.dates} tags={data.logTags} projects={data.projects} filter={filter} onFilter={changeFilter} />}
            {projectsView && (
              <ProjectList projects={data.projects} archivedOnly={archivedOnly} bugtrackerFilter={bugtrackerFilter} priorityFilter={priorityFilter} favoritesOnly={favoritesOnly} tagFilter={tagFilter} />
            )}
          </div>
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
