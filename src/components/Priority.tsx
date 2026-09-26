import type { KeyboardEvent } from 'react';
import { PRIORITIES, type Priority, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Une couleur par priorité (icône pleine) ; sans priorité : atténuée et vide.
export const PRIORITY_COLOR: Record<Priority, string> = {
  1: 'text-red-600 dark:text-red-400',
  2: 'text-amber-500 dark:text-amber-400',
  3: 'text-sky-600 dark:text-sky-400',
};

// Priorité d'une tâche, partagée par la ligne et la fiche : 1, 2 ou 3 la
// donne, le même chiffre la retire ; un clic sur l'icône passe à la suivante
// (aucune → 1 → 2 → 3 → aucune). Annulable (u).
export function usePriority(task: Task) {
  const { act, setUndo } = useActions();
  const set = (next: Priority | null) => {
    const before = task.priority;
    return act(async () => {
      await api.updateTask(task.id, { priority: next });
      setUndo({
        label: next ? `priorité ${next}` : 'retrait de la priorité',
        run: () => api.updateTask(task.id, { priority: before }),
        focus: `task:${task.id}`,
      });
    });
  };
  const cycle = () => set(task.priority === 3 ? null : (((task.priority ?? 0) + 1) as Priority));
  // Touches 1, 2, 3 ; true si la touche a été traitée.
  const onKey = (e: KeyboardEvent) => {
    const p = Number(e.key) as Priority;
    if (!PRIORITIES.includes(p)) return false;
    e.preventDefault();
    set(task.priority === p ? null : p);
    return true;
  };
  return { cycle, onKey };
}

// Icône « chiffre » (carré arrondi) : pleine, colorée, chiffre en blanc avec
// une priorité ; sans priorité, carré vide. noDigit : carré seul (le chiffre
// est déjà dans le libellé voisin).
export function PriorityIcon({ priority, className, noDigit }: { priority: Priority | null; className?: string; noDigit?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={priority ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
      {priority && !noDigit && (
        <text x="12" y="17.5" textAnchor="middle" fontSize="16" fontWeight="700" fill="white">
          {priority}
        </text>
      )}
    </svg>
  );
}

// Bouton de priorité : toujours visible avec une priorité, sinon atténué et
// visible au survol de la ligne (hidden).
export function PriorityButton({ priority, onClick, hidden }: { priority: Priority | null; onClick: () => void; hidden?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      tabIndex={-1}
      className={cn(
        'priority flex-none',
        priority ? PRIORITY_COLOR[priority] : 'text-muted-foreground',
        !priority && hidden && 'invisible group-hover:visible group-focus-within:visible',
      )}
      aria-label={priority ? `Priorité ${priority}` : 'Priorité'}
      title={`${priority ? `Priorité ${priority}` : 'Priorité'} (1 2 3)`}
      onClick={onClick}
    >
      <PriorityIcon priority={priority} />
    </Button>
  );
}
