import type { Project, Task } from '../../shared/types.ts';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TaskRow } from './TaskRow';

const plural = (n: number, word: string) => (n > 1 ? `${word}s` : word);

interface DayViewProps {
  projects: Project[];
  dayDone: number; // tâches du plan faites aujourd'hui (parties dans le Log)
  capacity: number; // maximum de tâches par jour (Réglages)
}

// Tâches à faire retenues par `keep`, groupées par projet.
function ByProject({ projects, keep }: { projects: Project[]; keep: (t: Task) => boolean }) {
  return projects
    .map((p) => ({ ...p, tasks: p.tasks.filter(keep) }))
    .filter((p) => p.tasks.length)
    .map((p) => (
      <div key={p.id} className="day-project mt-4">
        <div className="project-label ml-1 border-b pb-0.5 text-sm font-semibold">{p.name}</div>
        <ul>
          {p.tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      </div>
    ));
}

// Onglet « Aujourd’hui » : les tâches à faire prévues pour aujourd'hui (t, ☀
// ou date prévue), et en tête celles prévues avant et pas faites (en retard),
// groupées par projet, sous le compteur « 3/5 tâches » (rouge au-delà du
// maximum). Les tâches faites partent dans le Log mais restent comptées.
export function DayView({ projects, dayDone, capacity }: DayViewProps) {
  const today = localToday();
  const tasks = projects.flatMap((p) => p.tasks);
  const late = tasks.filter((t) => t.day_at && t.day_at < today).length;
  const todo = late + tasks.filter((t) => t.day_at === today).length;
  const total = todo + dayDone;
  const over = total > capacity;

  return (
    <section id="day" aria-label="Aujourd’hui">
      <p
        className={cn('day-count mt-3 text-sm', over ? 'font-medium text-destructive' : 'text-muted-foreground')}
        title={`Maximum : ${capacity} ${plural(capacity, 'tâche')} par jour (Réglages) ; les tâches en retard comptent`}
      >
        {total}/{capacity} {plural(total, 'tâche')}
      </p>
      {late > 0 && (
        <div className="late-tasks">
          <h3 className="mt-4 text-sm font-semibold text-destructive">En retard</h3>
          <ByProject projects={projects} keep={(t) => Boolean(t.day_at && t.day_at < today)} />
          <h3 className="mt-6 text-sm font-semibold text-muted-foreground">Aujourd’hui</h3>
        </div>
      )}
      <ByProject projects={projects} keep={(t) => t.day_at === today} />
      {!todo && (
        <p className="empty mt-3 italic text-muted-foreground">
          {dayDone ? 'Tout est fait.' : 'Rien de prévu.'}
        </p>
      )}
    </section>
  );
}
