import { useEffect, useRef, useState } from 'react';
import type { DoneTask, JournalDay, JournalFilter, Project } from '../../shared/types.ts';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatDay, isComplete } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TaskRow } from './TaskRow';
import { TagInput } from './TagInput';

// Le Log montre une fenêtre de 5 jours ayant des entrées (une semaine de travail).
export const LOG_DAYS = 5;

// Filtres du Log, indépendants de ceux de la zone des projets.
export interface Filter {
  day: string; // dernier jour de la fenêtre ; '' = période courante (les plus récents)
  project: string; // id du projet, '' = tous
  q: string; // recherche : titre, contenu, ticket
  tags: string[]; // tâches portant tous ces tags
}

export const NO_FILTER: Filter = { day: '', project: '', q: '', tags: [] };

// Les 5 derniers jours ayant des entrées qui correspondent aux filtres, jusqu'à `day`.
export function journalQuery(f: Filter): JournalFilter {
  return {
    to: f.day || undefined,
    projectId: Number(f.project) || undefined,
    q: f.q || undefined,
    tags: f.tags,
    limit: LOG_DAYS,
  };
}

const fieldClass = 'rounded-md border bg-background px-1.5 py-0.5 text-sm';

// Nom du projet toujours au-dessus de ses tâches, même filtré sur un projet :
// on voit ce que montre le filtre.
function Day({ day, highlight }: { day: JournalDay; highlight: string }) {
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
      {groups.map((g, i) => (
        <div key={`${g.id}-${i}`}>
          <div className="project-label mt-1.5 ml-1 text-sm font-semibold">{g.name}</div>
          <ul>
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} highlight={highlight} />
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
  tags: string[]; // tags des tâches faites (propositions)
  projects: Project[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}

export function Journal({ days, dates, tags, projects, filter, onFilter }: JournalProps) {
  // Champ de date non contrôlé : une valeur incomplète (année en cours de
  // frappe) ne doit pas être écrasée par React. Vide = période courante.
  const dateRef = useRef<HTMLInputElement>(null);
  const shownDate = filter.day;
  useEffect(() => {
    if (dateRef.current && dateRef.current.value !== shownDate) dateRef.current.value = shownDate;
  }, [shownDate]);
  const changeDay = (day: string) => isComplete(day) && onFilter({ ...filter, day });

  const filtered = Boolean(filter.day || filter.project || filter.q || filter.tags.length);

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

  // Pagination de 5 en 5 parmi les jours qui correspondent aux filtres (dates).
  // Fenêtre précédente : finit au jour qui précède la plus ancienne affichée ;
  // suivante : les 5 jours après la plus récente ('' si elle rejoint la période courante).
  const newest = days[0]?.date ?? filter.day;
  const oldest = days.at(-1)?.date ?? filter.day;
  const before = dates.filter((d) => d < oldest);
  const after = dates.filter((d) => d > newest);
  const prev = before.at(-1);
  const next = after.length ? (after.length > LOG_DAYS ? after[LOG_DAYS - 1] : '') : undefined;
  const goTo = (day: string) => onFilter({ ...filter, day });

  return (
    // Onglet Log : filtres sous les onglets, alignés à droite (comme ceux des projets).
    <section id="journal" aria-label="Log">
      <div className="mt-3 flex min-h-[26px] flex-wrap items-center justify-end gap-1.5">
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
        {/* Tags (#) : n'apparaît que si une tâche faite en porte. */}
        {(tags.length > 0 || filter.tags.length > 0) && (
          <TagInput
            id="log-tags"
            tags={filter.tags}
            suggestions={tags}
            onChange={(t) => onFilter({ ...filter, tags: t })}
            label="Filtrer le Log par tags"
            title="Seulement les tâches portant tous ces tags (#)"
            placeholder="Tags…"
            removeLabel={(tag) => `Retirer #${tag} du filtre`}
          />
        )}
        <input
          ref={dateRef}
          type="date"
          id="filter-date"
          aria-label="Jusqu’au"
          title={`Jusqu’au (d) : les ${LOG_DAYS} derniers jours ayant des entrées jusqu’à cette date`}
          className={fieldClass}
          onChange={(e) => changeDay(e.target.value)}
        />
        <select id="filter-project" aria-label="Filtrer par projet" title="Projet" className={fieldClass} value={filter.project} onChange={(e) => onFilter({ ...filter, project: e.target.value })}>
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
      <div className="mt-3 flex items-center gap-1" role="group" aria-label="Navigation par période">
        <Button
          id="day-prev"
          size="icon"
          className="size-7"
          aria-label="Jours précédents"
          title={prev ? `${LOG_DAYS} jours précédents, jusqu’au ${formatDay(prev)} (←)` : 'Pas de jours précédents'}
          disabled={!prev}
          onClick={() => prev && goTo(prev)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          id="day-next"
          size="icon"
          className="size-7"
          aria-label="Jours suivants"
          title={next === undefined ? 'Pas de jours suivants' : `${LOG_DAYS} jours suivants (→)`}
          disabled={next === undefined}
          onClick={() => next !== undefined && goTo(next)}
        >
          <ChevronRight aria-hidden />
        </Button>
        <p id="log-count" aria-live="polite" className="flex-1 text-center text-sm text-muted-foreground">
          {found}
        </p>
        {/* Tout à droite, toujours visible ; désactivé si on y est déjà. */}
        <Button
          id="day-today"
          className="h-7"
          title={`Revenir aux ${LOG_DAYS} derniers jours ayant des entrées`}
          disabled={next === undefined}
          onClick={() => goTo('')}
        >
          Courant
        </Button>
      </div>
      <div id="journal-days">
        {days.map((d) => (
          <Day key={d.date} day={d} highlight={filter.q} />
        ))}
        {!days.length && (
          <p className="empty mt-3 italic text-muted-foreground">{filtered ? 'Aucune tâche trouvée.' : 'Aucune tâche faite.'}</p>
        )}
      </div>
    </section>
  );
}
