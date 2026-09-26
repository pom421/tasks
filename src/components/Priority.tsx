import type { KeyboardEvent } from 'react';
import { PRIORITIES, type Priority, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Une couleur par priorité, en texte et contour (pas de fond coloré).
const COLOR: Record<Priority, string> = {
  1: 'border-red-600/50 text-red-600 dark:border-red-400/50 dark:text-red-400',
  2: 'border-amber-600/50 text-amber-600 dark:border-amber-400/50 dark:text-amber-400',
  3: 'border-sky-600/50 text-sky-600 dark:border-sky-400/50 dark:text-sky-400',
};

// Priorité d'une tâche, partagée par la ligne et la fiche : 1, 2 ou 3 la
// donne ; la même touche une 2e fois la retire. Annulable (u).
export function usePriority(task: Task) {
  const { act, setUndo } = useActions();
  const set = (p: Priority) => {
    const before = task.priority;
    const next = before === p ? null : p;
    return act(async () => {
      await api.updateTask(task.id, { priority: next });
      setUndo({
        label: next ? `priorité P${next}` : 'retrait de la priorité',
        run: () => api.updateTask(task.id, { priority: before }),
        focus: `task:${task.id}`,
      });
    });
  };
  // Touches 1, 2, 3 ; true si la touche a été traitée.
  const onKey = (e: KeyboardEvent) => {
    const p = Number(e.key) as Priority;
    if (!PRIORITIES.includes(p)) return false;
    e.preventDefault();
    set(p);
    return true;
  };
  return { set, onKey };
}

// Badge « P1 » en tête de ligne, à la couleur de la priorité.
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  return (
    <span
      className={cn('priority flex-none rounded-full border px-1.5 text-[11px] leading-[18px] font-medium', COLOR[priority])}
      title={`Priorité ${priority} (1, 2, 3 : changer ; même touche : retirer)`}
    >
      <span className="sr-only">Priorité </span>P{priority}
    </span>
  );
}

// Fiche : trois boutons bascule P1 P2 P3 ; actif = couleur de la priorité, atténué sinon.
export function PriorityButtons({ task, onSet }: { task: Task; onSet: (p: Priority) => void }) {
  return (
    <span className="priority-buttons flex gap-1">
      {PRIORITIES.map((p) => (
        <Button
          key={p}
          size="xs"
          className={cn('font-medium', task.priority === p ? COLOR[p] : 'text-muted-foreground')}
          aria-pressed={task.priority === p}
          title={task.priority === p ? `Retirer la priorité (${p})` : `Priorité ${p} (${p})`}
          onClick={() => onSet(p)}
        >
          P{p}
        </Button>
      ))}
    </span>
  );
}
