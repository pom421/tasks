import { useEffect, useState, type KeyboardEvent } from 'react';
import { Hourglass, Pause, Play, RotateCcw } from 'lucide-react';
import { formatDuration, timeSpent, type Task, type TimerAction } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Chrono d'une tâche à faire, partagé par la ligne et la fiche :
// c lance / met en pause, C arrête et remet à zéro. Annulable (u).
export function useTimer(task: Task) {
  const { undoable } = useActions();
  const running = Boolean(task.timer_started_at);
  const seconds = timeSpent(task);

  // En marche : réaffichage régulier (précision à la minute).
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(timer);
  }, [running]);

  // Annuler / rejouer remet le chrono tel qu'il était avant / après.
  const run = (action: TimerAction, label: string) => {
    const before = { time_spent: task.time_spent, timer_started_at: task.timer_started_at };
    let after = before;
    return undoable({
      label,
      focus: `task:${task.id}`,
      run: async () => {
        const t = (await api.updateTask(task.id, { timer: action })) as Task;
        after = { time_spent: t.time_spent, timer_started_at: t.timer_started_at };
      },
      undo: () => api.updateTask(task.id, before),
      redo: () => api.updateTask(task.id, after),
    });
  };
  const toggle = () => (running ? run('pause', 'pause du chrono') : run('start', 'lancement du chrono'));
  const reset = () => run('reset', 'remise à zéro du chrono');

  // Touches du chrono ; true si la touche a été traitée.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'c') toggle();
    else if (e.key === 'C' && (running || seconds > 0)) reset();
    else return false;
    e.preventDefault();
    return true;
  };

  return { seconds, running, toggle, reset, onKey };
}

export type TimerState = ReturnType<typeof useTimer>;

// Temps passé (ligne et fiche), s'il y en a : sablier et durée, texte normal
// chrono en marche, atténué sinon.
export function TimeSpent({ timer, className }: { timer: TimerState; className?: string }) {
  if (!timer.running && !timer.seconds) return null;
  return (
    <span
      className={cn(
        'time-spent flex flex-none items-center gap-0.5 tabular-nums whitespace-nowrap',
        timer.running ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
      title={timer.running ? 'Temps passé, chrono en marche' : 'Temps passé'}
    >
      <Hourglass aria-hidden />
      {formatDuration(timer.seconds)}
    </span>
  );
}

// Icônes du chrono : remise à zéro s'il y a du temps, puis lancer / pause
// (pleine en marche, temps passé en info-bulle).
export function TimerButtons({ timer, className }: { timer: TimerState; className?: string }) {
  const hasTime = timer.running || timer.seconds > 0;
  const time = hasTime ? `${formatDuration(timer.seconds)} · ` : '';
  return (
    <span className={cn('timer flex flex-none', className)}>
      {/* Place gardée même sans temps passé : lancer / pause ne bouge jamais. */}
      <Button
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className={cn('timer-reset text-muted-foreground', !hasTime && 'invisible')}
        aria-hidden={!hasTime || undefined}
        aria-label="Remettre le chrono à zéro"
        title="Remettre à zéro (C)"
        onClick={timer.reset}
      >
        <RotateCcw aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className={cn('timer-toggle', timer.running ? 'text-foreground' : 'text-muted-foreground')}
        aria-label="Chrono"
        aria-pressed={timer.running}
        title={`${time}${timer.running ? 'Pause' : 'Lancer le chrono'} (c)`}
        onClick={timer.toggle}
      >
        {timer.running ? <Pause aria-hidden fill="currentColor" /> : <Play aria-hidden />}
      </Button>
    </span>
  );
}
