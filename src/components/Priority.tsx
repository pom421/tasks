import type { KeyboardEvent } from 'react';
import { Flag } from 'lucide-react';
import { PRIORITIES, type Priority, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Une couleur par priorité (icône pleine) ; sans priorité : atténuée et vide.
const COLOR: Record<Priority, string> = {
  1: 'text-red-600 dark:text-red-400',
  2: 'text-amber-500 dark:text-amber-400',
  3: 'text-sky-600 dark:text-sky-400',
};

// Priorité d'une tâche, partagée par la ligne et la fiche : 1, 2 ou 3 la
// donne ; la même touche une 2e fois la retire ; un clic sur l'icône passe à
// la suivante (aucune → P1 → P2 → P3 → aucune). Annulable (u).
export function usePriority(task: Task) {
  const { act, setUndo } = useActions();
  const set = (p: Priority | null) => {
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
  const cycle = () => set(task.priority === 3 ? null : (((task.priority ?? 0) + 1) as Priority));
  return { set, cycle, onKey };
}

// Icône drapeau : pleine et colorée avec une priorité (toujours visible),
// sinon atténuée, vide, visible au survol de la ligne (hidden).
export function PriorityButton({ priority, onClick, hidden }: { priority: Priority | null; onClick: () => void; hidden?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn(
        'priority flex-none',
        priority ? COLOR[priority] : 'text-muted-foreground',
        !priority && hidden && 'invisible group-hover:visible group-focus-within:visible',
      )}
      aria-label={priority ? `Priorité P${priority}` : 'Priorité'}
      title={`${priority ? `P${priority}` : 'Priorité'} (1 2 3)`}
      onClick={onClick}
    >
      <Flag aria-hidden fill={priority ? 'currentColor' : 'none'} />
    </Button>
  );
}
