import { useEffect, useRef } from 'react';
import type { DoneTask, JournalDay, JournalFilter, Project } from '../../shared/types.ts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDay, isComplete, localToday } from '@/lib/dates';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { TaskRow } from './TaskRow';

export interface Filter {
  from: string;
  to: string;
  project: string; // id du projet, '' = tous
  jira: boolean; // seulement les tâches à reporter dans Jira (liste et journal)
  day: string; // jour affiché hors filtre par période ; '' = aujourd'hui
}

export const NO_FILTER: Filter = { from: '', to: '', project: '', jira: false, day: '' };

// Sans période ni filtre « à reporter », le Log montre un seul jour (aujourd'hui par défaut).
export const isDayMode = (f: Filter) => !f.from && !f.to && !f.jira;

export function journalQuery(f: Filter): JournalFilter {
  const day = f.day || localToday();
  return {
    from: isDayMode(f) ? day : f.from,
    to: isDayMode(f) ? day : f.to,
    projectId: Number(f.project) || undefined,
    jiraPending: f.jira,
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
  const { toast } = useActions();
  // Champs de date non contrôlés : une valeur incomplète (année en cours de
  // frappe) ne doit pas être écrasée par React.
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (fromRef.current && fromRef.current.value !== filter.from) fromRef.current.value = filter.from;
    if (toRef.current && toRef.current.value !== filter.to) toRef.current.value = filter.to;
  }, [filter.from, filter.to]);

  // Date de début renseignée : la date de fin prend la même valeur (une journée)
  // et reçoit le focus pour être ajustée si besoin.
  const changeFrom = (from: string) => {
    if (!isComplete(from)) return;
    onFilter({ ...filter, from, to: from || filter.to });
    if (from && toRef.current) {
      toRef.current.value = from;
      toRef.current.focus();
    }
  };

  const changeTo = (to: string) => {
    if (!isComplete(to)) return;
    if (to && filter.from && to < filter.from) {
      toast('La date de fin doit être après la date de début');
      if (toRef.current) toRef.current.value = filter.to;
      return;
    }
    onFilter({ ...filter, to });
  };

  const filtered = Boolean(filter.from || filter.to || filter.project || filter.jira);

  // Navigation jour par jour : parmi les jours ayant des entrées, plus aujourd'hui
  // (pour pouvoir y revenir). Hors mode « un jour », les boutons sont désactivés.
  const today = localToday();
  const dayMode = isDayMode(filter);
  const current = filter.day || today;
  const stops = [...new Set([...dates, today])].sort();
  const prev = dayMode ? stops.filter((d) => d < current).at(-1) : undefined;
  const next = dayMode ? stops.find((d) => d > current) : undefined;
  const goTo = (day: string) => onFilter({ ...filter, day: day === today ? '' : day });

  return (
    <section id="journal" aria-label="Log" className="mt-12 mb-16 border-t-2 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Log</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <label className="flex items-center gap-1">
            Du <input ref={fromRef} type="date" id="filter-from" aria-label="Date de début" className={fieldClass} onChange={(e) => changeFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            au <input ref={toRef} type="date" id="filter-to" aria-label="Date de fin" min={filter.from} className={fieldClass} onChange={(e) => changeTo(e.target.value)} />
          </label>
          <select id="filter-project" aria-label="Filtrer par projet" className={fieldClass} value={filter.project} onChange={(e) => onFilter({ ...filter, project: e.target.value })}>
            <option value="">Tous les projets</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name + (p.archived_at ? ' (archivé)' : '')}
              </option>
            ))}
          </select>
          {filtered && (
            <Button id="filter-reset" variant="outline" size="xs" onClick={() => onFilter(NO_FILTER)}>
              Réinitialiser
            </Button>
          )}
        </div>
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
        {dayMode && current !== today && (
          <Button id="day-today" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => goTo(today)}>
            Aujourd’hui
          </Button>
        )}
      </div>
      <div id="journal-days">
        {dayMode ? (
          <Day day={days[0] ?? { date: current, tasks: [] }} showProjects={!filter.project} />
        ) : (
          days.map((d) => <Day key={d.date} day={d} showProjects={!filter.project} />)
        )}
        {!dayMode && !days.length && (
          <p className="empty mt-3 italic text-muted-foreground">
            Aucune tâche faite pour ce filtre.
          </p>
        )}
      </div>
    </section>
  );
}
