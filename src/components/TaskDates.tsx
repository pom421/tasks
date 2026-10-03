import { AlarmClock } from 'lucide-react';
import { formatDay, localToday, shortDay } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Échéance d'une tâche à faire, en étiquette courte (« 30/12 »),
// date complète en info-bulle : fond ambré ; dépassée : fond rouge. Emplacement
// de largeur fixe, gardé même sans échéance : les échéances s'alignent d'une
// ligne à l'autre. La date prévue n'est que dans la fiche.
export function DueDate({ due }: { due: string | null }) {
  const today = localToday();
  if (!due) return <span className="due-slot w-14 flex-none" aria-hidden />;
  const label = `${due < today ? 'Échéance dépassée' : 'Échéance'} : ${formatDay(due)}`;
  // Info-bulle de l'app, rapide (l'info-bulle native, lente, ne s'affichait pas toujours).
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'due-date flex w-14 flex-none items-center justify-center gap-0.5 rounded px-1 text-[11px] leading-[18px] whitespace-nowrap [&_svg]:size-3 [&_svg]:flex-none',
            due < today
              ? 'late bg-red-100 font-medium text-red-700 dark:bg-red-800 dark:text-red-50'
              : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
          )}
        >
          <AlarmClock aria-hidden />
          <span className="sr-only">{label}</span>
          <span aria-hidden>{shortDay(due)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="due-tooltip">
        {label}
      </TooltipContent>
    </Tooltip>
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
