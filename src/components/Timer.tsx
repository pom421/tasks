import { useEffect, useState, type KeyboardEvent } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { formatDuration, timeSpent, type Task, type TimerAction } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Chrono d'une tâche à faire, partagé par la ligne et la fiche :
// t lance / met en pause, T arrête et remet à zéro. Annulable (u).
export function useTimer(task: Task) {
  const { act, setUndo } = useActions();
  const running = Boolean(task.timer_started_at);
  const seconds = timeSpent(task);

  // En marche : réaffichage régulier (précision à la minute).
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(timer);
  }, [running]);

  const run = (action: TimerAction, label: string) => {
    const before = { time_spent: task.time_spent, timer_started_at: task.timer_started_at };
    return act(async () => {
      await api.updateTask(task.id, { timer: action });
      setUndo({ label, run: () => api.updateTask(task.id, before), focus: `task:${task.id}` });
    });
  };
  const toggle = () => (running ? run('pause', 'pause du chrono') : run('start', 'lancement du chrono'));
  const reset = () => run('reset', 'remise à zéro du chrono');

  // Touches du chrono ; true si la touche a été traitée.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 't') toggle();
    else if (e.key === 'T' && (running || seconds > 0)) reset();
    else return false;
    e.preventDefault();
    return true;
  };

  return { seconds, running, toggle, reset, onKey };
}

export type TimerState = ReturnType<typeof useTimer>;

// Icônes du chrono : lancer / pause (pleine en marche, temps passé en
// info-bulle), remise à zéro s'il y a du temps.
export function TimerButtons({ timer, className }: { timer: TimerState; className?: string }) {
  const time = timer.running || timer.seconds > 0 ? `${formatDuration(timer.seconds)} · ` : '';
  return (
    <span className={cn('timer flex flex-none', className)}>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn('timer-toggle', timer.running ? 'text-foreground' : 'text-muted-foreground')}
        aria-label="Chrono"
        aria-pressed={timer.running}
        title={`${time}${timer.running ? 'Pause' : 'Lancer le chrono'} (t)`}
        onClick={timer.toggle}
      >
        {timer.running ? <Pause aria-hidden fill="currentColor" /> : <Play aria-hidden />}
      </Button>
      {(timer.running || timer.seconds > 0) && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="timer-reset text-muted-foreground"
          aria-label="Remettre le chrono à zéro"
          title="Remettre à zéro (T)"
          onClick={timer.reset}
        >
          <RotateCcw aria-hidden />
        </Button>
      )}
    </span>
  );
}
