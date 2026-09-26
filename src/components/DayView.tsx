import type { Project } from '../../shared/types.ts';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TaskRow } from './TaskRow';

const plural = (n: number, word: string) => (n > 1 ? `${word}s` : word);

interface DayViewProps {
  projects: Project[];
  dayDone: number; // tâches de la journée déjà faites (parties dans le Log)
  capacity: number; // maximum de tâches par jour (Réglages)
}

// Onglet « Plan journée » : seulement les tâches à faire du plan du jour
// (s ou ☀), groupées par projet, sous le compteur « 3/5 tâches » (rouge au-delà
// du maximum). Les tâches faites partent dans le Log mais restent comptées.
export function DayView({ projects, dayDone, capacity }: DayViewProps) {
  const today = localToday();
  const groups = projects
    .map((p) => ({ ...p, tasks: p.tasks.filter((t) => t.day_at === today) }))
    .filter((p) => p.tasks.length);
  const todo = groups.reduce((n, p) => n + p.tasks.length, 0);
  const total = todo + dayDone;
  const over = total > capacity;

  return (
    <section id="day" aria-label="Plan journée">
      <p
        className={cn('day-count mt-3 text-sm', over ? 'font-medium text-destructive' : 'text-muted-foreground')}
        title={`Maximum : ${capacity} ${plural(capacity, 'tâche')} par jour (Réglages)`}
      >
        {total}/{capacity} {plural(total, 'tâche')}
      </p>
      {groups.map((p) => (
        <div key={p.id} className="day-project mt-4">
          <div className="project-label ml-1 border-b pb-0.5 text-sm font-semibold">{p.name}</div>
          <ul>
            {p.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      ))}
      {!todo && (
        <p className="empty mt-3 italic text-muted-foreground">
          {dayDone ? 'Tout est fait.' : 'Rien de prévu.'}
        </p>
      )}
    </section>
  );
}
