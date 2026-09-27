import type { Project, Task } from '../../shared/types.ts';
import { formatDay, localToday } from '@/lib/dates';
import { TaskRow } from './TaskRow';

type Entry = Task & { project_name: string };

// Onglet « Prochainement » : agenda des tâches à faire datées, à partir
// d'aujourd'hui, un cadre par jour (comme le Log). Une tâche apparaît à sa
// date prévue et à son échéance ; ses étiquettes disent laquelle. En tête,
// les échéances dépassées. Les dates prévues passées sont dans Aujourd’hui.
export function UpcomingView({ projects }: { projects: Project[] }) {
  const today = localToday();
  const byDate = new Map<string, Entry[]>();
  const put = (date: string, t: Entry) => {
    const list = byDate.get(date) ?? [];
    if (!list.includes(t)) byDate.set(date, [...list, t]);
  };
  for (const p of projects) {
    for (const task of p.tasks) {
      const t = { ...task, project_name: p.name };
      if (t.due_at && t.due_at < today) put('', t); // '' : échéance dépassée
      for (const date of [t.day_at, t.due_at]) if (date && date >= today) put(date, t);
    }
  }
  const dates = [...byDate.keys()].sort();

  return (
    <section id="upcoming" aria-label="Prochainement">
      {dates.map((date) => (
        <Day key={date} title={date ? formatDay(date) : 'Échéance dépassée'} late={!date} tasks={byDate.get(date)!} />
      ))}
      {!dates.length && <p className="empty mt-3 italic text-muted-foreground">Aucune tâche datée à venir.</p>}
    </section>
  );
}

// Un jour : tâches groupées par projet, nom du projet au-dessus.
function Day({ title, late, tasks }: { title: string; late: boolean; tasks: Entry[] }) {
  const groups: { id: number; name: string; tasks: Entry[] }[] = [];
  for (const t of tasks) {
    let g = groups.find((x) => x.id === t.project_id);
    if (!g) groups.push((g = { id: t.project_id, name: t.project_name, tasks: [] }));
    g.tasks.push(t);
  }
  return (
    <div className="upcoming-day mt-3 rounded-lg border px-3 pt-2 pb-1.5">
      <h3 className={`mb-1 border-b pb-1 text-sm font-semibold first-letter:uppercase ${late ? 'text-destructive' : 'text-muted-foreground'}`}>{title}</h3>
      {groups.map((g) => (
        <div key={g.id}>
          <div className="project-label mt-1.5 ml-1 text-sm font-semibold">{g.name}</div>
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
