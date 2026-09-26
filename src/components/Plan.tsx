import type { KeyboardEvent } from 'react';
import { Sun } from 'lucide-react';
import type { Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Plan journée d'une tâche à faire, partagé par la ligne et la fiche : t (ou ☀)
// l'ajoute au plan du jour (date du navigateur) ou l'en retire. Annulable (u).
// stay : dans l'onglet Plan journée, la ligne retirée disparaît, le curseur reste en place.
export function usePlan(task: Task) {
  const { act, setUndo } = useActions();
  const inPlan = task.day_at === localToday();
  const toggle = () =>
    act(
      async () => {
        await api.updateTask(task.id, { day_at: inPlan ? null : localToday() });
        setUndo({
          label: inPlan ? 'retrait du plan' : 'ajout au plan',
          run: () => api.updateTask(task.id, { day_at: task.day_at }),
          focus: `task:${task.id}`,
        });
      },
      { stay: true },
    );
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 't') return false;
    e.preventDefault();
    toggle();
    return true;
  };
  return { inPlan, toggle, onKey };
}

// Icône ☀ : pleine et ambrée si au plan (toujours visible), sinon atténuée,
// vide, visible au survol de la ligne (hidden).
export function PlanButton({ plan, hidden }: { plan: ReturnType<typeof usePlan>; hidden?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      tabIndex={-1}
      className={cn(
        'day-toggle flex-none',
        plan.inPlan ? 'text-amber-500' : 'text-muted-foreground',
        !plan.inPlan && hidden && 'invisible group-hover:visible group-focus-within:visible',
      )}
      aria-label="Plan journée"
      aria-pressed={plan.inPlan}
      title={plan.inPlan ? 'Retirer du plan (t)' : 'Ajouter au plan (t)'}
      onClick={plan.toggle}
    >
      <Sun aria-hidden fill={plan.inPlan ? 'currentColor' : 'none'} />
    </Button>
  );
}
