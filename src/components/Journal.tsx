import { useEffect, useRef, useState } from 'react';
import type { DoneTask, JournalDay, JournalFilter, Project } from '../../shared/types.ts';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDay, isComplete, localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TaskRow } from './TaskRow';

// Filtres du Log, indépendants de ceux de la zone des projets.
export interface Filter {
  day: string; // journée choisie ; '' = aujourd'hui (sans recherche) ou toutes (avec recherche)
  project: string; // id du projet, '' = tous
  q: string; // recherche : titre, contenu, ticket
}

export const NO_FILTER: Filter = { day: '', project: '', q: '' };

// Sans recherche, le Log montre un seul jour (aujourd'hui par défaut).
export const isDayMode = (f: Filter) => !f.q;

// La journée choisie filtre toujours ; sans recherche, c'est aujourd'hui par défaut.
export function journalQuery(f: Filter): JournalFilter {
  const day = f.day || (isDayMode(f) ? localToday() : '');
  return {
    from: day || undefined,
    to: day || undefined,
    projectId: Number(f.project) || undefined,
    q: f.q || undefined,
  };
}

const fieldClass = 'rounded-md border bg-background px-1.5 py-0.5 text-sm';

function Day({ day, showProjects }: { day: JournalDay; showProjects: boolean }) {
  // Regroupe les tâches consécutives d'un même projet.
  const groups: { id: number; name: string; tasks: DoneTask[] }[] = [];
  for (const t of day.tasks) {
    let g = groups.at(-1);
    if (g?.id !== t.project_id) groups.push((g = { id: t.project_id, name: t.project_name, tasks: [] }));
    g.tasks.push(t);
  }
  return (
    <div className="day mt-3 rounded-lg border px-3 pt-2 pb-1.5">
      <h3 className="mb-1 border-b pb-1 text-sm font-semibold text-muted-foreground first-letter:uppercase">
        {formatDay(day.date)}
      </h3>
      {!day.tasks.length && <p className="empty py-1 text-sm italic text-muted-foreground">Rien de fait ce jour-là.</p>}
      {groups.map((g, i) => (
        <div key={`${g.id}-${i}`}>
          {showProjects && <div className="project-label mt-1.5 ml-1 text-sm font-semibold">{g.name}</div>}
          <ul>
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface JournalProps {
  days: JournalDay[];
  dates: string[];
  projects: Project[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}

export function Journal({ days, dates, projects, filter, onFilter }: JournalProps) {
  const today = localToday();
  const dayMode = isDayMode(filter);
  const current = filter.day || today;

  // Champ de date non contrôlé : une valeur incomplète (année en cours de
  // frappe) ne doit pas être écrasée par React. Il montre le jour affiché ;
  // pendant une recherche, vide = toutes les journées.
  const dateRef = useRef<HTMLInputElement>(null);
  const shownDate = dayMode ? current : filter.day;
  useEffect(() => {
    if (dateRef.current && dateRef.current.value !== shownDate) dateRef.current.value = shownDate;
  }, [shownDate]);
  const changeDay = (day: string) => isComplete(day) && onFilter({ ...filter, day });

  const filtered = Boolean(filter.day || filter.project || filter.q);

  // Recherche : lancée 250 ms après la dernière frappe ; le champ suit la
  // réinitialisation des filtres.
  const [query, setQuery] = useState(filter.q);
  // Valeurs courantes lues au déclenchement (onFilter change à chaque rendu).
  const latest = useRef({ filter, onFilter });
  latest.current = { filter, onFilter };
  useEffect(() => setQuery(filter.q), [filter.q]);
  useEffect(() => {
    if (query.trim() === latest.current.filter.q) return;
    const timer = setTimeout(() => latest.current.onFilter({ ...latest.current.filter, q: query.trim() }), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // « 5 tâches trouvées dans 2 journées »
  const taskCount = days.reduce((n, d) => n + d.tasks.length, 0);
  const dayCount = days.filter((d) => d.tasks.length).length;
  const s = (n: number) => (n > 1 ? 's' : '');
  const found = taskCount
    ? `${taskCount} tâche${s(taskCount)} trouvée${s(taskCount)} dans ${dayCount} journée${s(dayCount)}`
    : 'Aucune tâche trouvée';

  // Navigation jour par jour : parmi les jours ayant des entrées, plus aujourd'hui
  // (pour pouvoir y revenir). Hors mode « un jour », les boutons sont désactivés.
  const stops = [...new Set([...dates, today])].sort();
  const prev = dayMode ? stops.filter((d) => d < current).at(-1) : undefined;
  const next = dayMode ? stops.find((d) => d > current) : undefined;
  const goTo = (day: string) => onFilter({ ...filter, day: day === today ? '' : day });

  return (
    <section id="journal" aria-label="Log" className="mt-12 mb-16 border-t-2 pt-4">
      {/* Titre et filtres sur une ligne (repliée sur écran étroit). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-auto font-semibold">Log</h2>
        <input
          type="search"
          id="log-search"
          aria-label="Rechercher dans le Log"
          title="Rechercher dans le Log : titre, contenu, ticket (/)"
          placeholder="Rechercher… (/)"
          className={cn(fieldClass, 'w-40 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
        <input
          ref={dateRef}
          type="date"
          id="filter-date"
          aria-label="Journée"
          title="Journée (d)"
          className={fieldClass}
          onChange={(e) => changeDay(e.target.value)}
        />
        <select id="filter-project" aria-label="Filtrer par projet" title="Projet (f)" className={fieldClass} value={filter.project} onChange={(e) => onFilter({ ...filter, project: e.target.value })}>
          <option value="">Tous les projets</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name + (p.archived_at ? ' (archivé)' : '')}
            </option>
          ))}
        </select>
        {filtered && (
          <Button
            id="filter-reset"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Réinitialiser les filtres du Log"
            title="Réinitialiser les filtres du Log (Échap)"
            onClick={() => onFilter(NO_FILTER)}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1" role="group" aria-label="Navigation par jour">
        <Button
          id="day-prev"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label="Jour précédent"
          title={prev ? formatDay(prev) : 'Pas de jour précédent'}
          disabled={!prev}
          onClick={() => prev && goTo(prev)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          id="day-next"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label="Jour suivant"
          title={next ? formatDay(next) : 'Pas de jour suivant'}
          disabled={!next}
          onClick={() => next && goTo(next)}
        >
          <ChevronRight aria-hidden />
        </Button>
        <p id="log-count" aria-live="polite" className="flex-1 text-center text-sm text-muted-foreground">
          {found}
        </p>
        {/* Tout à droite, toujours visible ; désactivé si on y est déjà. */}
        <Button
          id="day-today"
          variant="outline"
          size="sm"
          className="h-7"
          title="Revenir au jour courant"
          disabled={!dayMode || current === today}
          onClick={() => goTo(today)}
        >
          Aujourd’hui
        </Button>
      </div>
      <div id="journal-days">
        {dayMode ? (
          <Day day={days[0] ?? { date: current, tasks: [] }} showProjects={!filter.project} />
        ) : (
          days.map((d) => <Day key={d.date} day={d} showProjects={!filter.project} />)
        )}
        {!dayMode && !days.length && (
          <p className="empty mt-3 italic text-muted-foreground">
            Aucune tâche trouvée.
          </p>
        )}
      </div>
    </section>
  );
}
