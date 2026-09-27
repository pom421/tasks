import { AlarmClock, CalendarDays } from 'lucide-react';
import type { Task } from '../../shared/types.ts';
import { formatDay, localToday, shortDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

const badge = 'flex flex-none items-center gap-0.5 rounded px-1 text-[11px] leading-[18px] whitespace-nowrap [&_svg]:size-3';

// Dates d'une tâche à faire, en étiquettes courtes (« demain », « lun. 29 »),
// date complète en info-bulle. Icônes distinctes : calendrier (prévue),
// réveil (échéance), sablier (durée, dans la fiche). Date prévue : fond gris ; masquée si c'est
// aujourd'hui (le ☀ plein le dit déjà) ; en retard : texte rouge.
// Échéance : fond ambré ; dépassée : fond rouge.
export function TaskDates({ task }: { task: Pick<Task, 'day_at' | 'due_at'> }) {
  const today = localToday();
  const { day_at: day, due_at: due } = task;
  return (
    <>
      {day && day !== today && (
        <span
          className={cn('planned-date', badge, 'bg-muted', day < today ? 'late font-medium text-destructive' : 'text-muted-foreground')}
          title={`${day < today ? 'En retard : prévue' : 'Prévue'} le ${formatDay(day)}`}
        >
          <CalendarDays aria-hidden />
          <span className="sr-only">{day < today ? 'en retard, prévue' : 'prévue'}</span>
          {shortDay(day, today)}
        </span>
      )}
      {due && (
        <span
          className={cn(
            'due-date',
            badge,
            due < today
              ? 'late bg-red-100 font-medium text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
          )}
          title={`${due < today ? 'Échéance dépassée' : 'Échéance'} : ${formatDay(due)}`}
        >
          <AlarmClock aria-hidden />
          <span className="sr-only">{due < today ? 'échéance dépassée' : 'échéance'}</span>
          {shortDay(due, today)}
        </span>
      )}
    </>
  );
}

// Tags d'une tâche : « #client #urgent », en petit texte atténué, sans fond.
export function TaskTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="tags max-w-[35%] flex-none truncate text-[11px] text-muted-foreground" title={`Tags : ${tags.map((t) => `#${t}`).join(' ')}`}>
      {tags.map((t) => `#${t}`).join(' ')}
    </span>
  );
}
