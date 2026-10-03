import type { ReactNode } from 'react';
import { AlarmClock, CalendarCheck, CalendarDays } from 'lucide-react';
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

// Date prévue (hors aujourd'hui : la ☀ pleine le dit déjà) et date de fin
// d'une tâche faite : « 30/12 », texte atténué, sans fond, date complète en info-bulle.
export function PlannedDate({ day }: { day: string | null }) {
  if (!day || day === localToday()) return null;
  return <ShortDate className="planned-date" label={`Prévue le ${formatDay(day)}`} day={day} icon={<CalendarDays aria-hidden />} />;
}

export function DoneDate({ day }: { day: string }) {
  return <ShortDate className="done-date" label={`Faite le ${formatDay(day)}`} day={day} icon={<CalendarCheck aria-hidden />} />;
}

function ShortDate({ className, label, day, icon }: { className: string; label: string; day: string; icon: ReactNode }) {
  return (
    <span className={cn(className, 'flex flex-none items-center gap-0.5 text-[11px] whitespace-nowrap text-muted-foreground [&_svg]:size-3')} title={label}>
      {icon}
      <span className="sr-only">{label}</span>
      <span aria-hidden>{shortDay(day)}</span>
    </span>
  );
}

// Tags d'une tâche : « #client #urgent », en petit texte atténué, sans fond.
export function TaskTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="tags min-w-0 truncate text-[11px] text-muted-foreground" title={`Tags : ${tags.map((t) => `#${t}`).join(' ')}`}>
      {tags.map((t) => `#${t}`).join(' ')}
    </span>
  );
}
