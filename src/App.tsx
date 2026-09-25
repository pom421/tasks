import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JournalDay, Project } from '../shared/types.ts';
import { api } from '@/lib/api';
import { ActionsContext, type Actions } from '@/lib/actions';
import { focusByKey, handleNavKey, restore, snapshot, type FocusSnapshot } from '@/lib/nav';
import { Toolbar } from '@/components/Toolbar';
import { ProjectList } from '@/components/ProjectList';
import { Journal, NO_FILTER, type Filter } from '@/components/Journal';

interface Data {
  projects: Project[];
  days: JournalDay[];
}

// Focus à appliquer une fois les nouvelles données affichées.
interface PendingFocus {
  snap: FocusSnapshot | null;
  stay: boolean;
  key?: string;
}

export function App() {
  const [data, setData] = useState<Data>({ projects: [], days: [] });
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
      api.journal({ from: f.from, to: f.to, projectId: Number(f.project) || undefined }),
    ]);
    setData({ projects: state.projects, days: journal.days });
  }, []);

  useEffect(() => {
    load().catch((err) => toast(err.message));
  }, [load, toast]);

  const actions: Actions = {
    toast,
    setLastProject: (id) => (lastProject.current = id),
    act: async (fn, { stay = false } = {}) => {
      let result: unknown;
      try {
        result = await fn();
      } catch (err) {
        toast((err as Error).message);
      }
      // Après fn (qui a pu vider un champ d'ajout), juste avant le re-rendu.
      pending.current = { snap: snapshot(), stay, key: (result as { focus?: string } | undefined)?.focus };
      await load().catch((err) => toast(err.message));
    },
  };

  // Restaure le focus clavier après chaque rechargement des données.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.key) focusByKey(p.key);
    else restore(p.snap, { stay: p.stay });
  }, [data]);

  const changeFilter = (f: Filter) => {
    filterRef.current = f;
    setFilter(f);
    load(f).catch((err) => toast(err.message));
  };

  // Navigation (↑/↓…) et raccourcis globaux, hors champs de saisie.
  useEffect(() => {
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

  return (
    <ActionsContext.Provider value={actions}>
      <div className="mx-auto max-w-2xl px-4">
        <Toolbar showArchived={showArchived} onShowArchived={setShowArchived} helpOpen={helpOpen} onHelpOpen={setHelpOpen} />
        <main>
          <ProjectList projects={data.projects} showArchived={showArchived} />
          <Journal days={data.days} projects={data.projects} filter={filter} onFilter={changeFilter} />
        </main>
      </div>
      {message && (
        <div id="toast" role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-1.5 text-sm text-background">
          {message}
        </div>
      )}
    </ActionsContext.Provider>
  );
}
