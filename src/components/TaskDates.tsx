import { AlarmClock, CalendarDays } from 'lucide-react';
import { formatDay, localToday, shortDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

// Échéance d'une tâche à faire, en étiquette courte (« 30/12 »),
// date complète en info-bulle : fond ambré ; dépassée : fond rouge. Emplacement
// de largeur fixe, gardé même sans échéance : les échéances s'alignent d'une
// ligne à l'autre.
export function DueDate({ due }: { due: string | null }) {
  const today = localToday();
  if (!due) return <span className="due-slot w-14 flex-none" aria-hidden />;
  const label = `${due < today ? 'Échéance dépassée' : 'Échéance'} : ${formatDay(due)}`;
  return (
    <span
      className={cn(
        'due-date flex w-14 flex-none items-center justify-center gap-0.5 rounded px-1 text-[11px] leading-[18px] whitespace-nowrap [&_svg]:size-3 [&_svg]:flex-none',
        due < today
          ? 'late bg-red-100 font-medium text-red-700 dark:bg-red-800 dark:text-red-50'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
      )}
      title={label}
    >
      <AlarmClock aria-hidden />
      <span className="sr-only">{label}</span>
      <span aria-hidden>{shortDay(due)}</span>
    </span>
  );
}

// Date prévue (hors aujourd'hui : la ☀ pleine le dit déjà) : « 30/12 », texte
// atténué, sans fond, date complète en info-bulle.
export function PlannedDate({ day }: { day: string | null }) {
  if (!day || day === localToday()) return null;
  const label = `Prévue le ${formatDay(day)}`;
  return (
    <span className="planned-date flex flex-none items-center gap-0.5 text-[11px] whitespace-nowrap text-muted-foreground [&_svg]:size-3" title={label}>
      <CalendarDays aria-hidden />
      <span className="sr-only">{label}</span>
      <span aria-hidden>{shortDay(day)}</span>
    </span>
  );
}

// Tags d'une tâche : « #client #urgent », en petit texte atténué, sans fond.
export function TaskTags({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn('tags min-w-0 truncate text-[11px] text-muted-foreground', className)} title={`Tags : ${tags.map((t) => `#${t}`).join(' ')}`}>
      {tags.map((t) => `#${t}`).join(' ')}
    </span>
  );
}
