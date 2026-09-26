import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { formatDuration, timeSpent, type Task, type TimerAction } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Chrono d'une tâche à faire, partagé par la ligne et la fiche :
// t lance / met en pause ; T arrête et remet à zéro, en deux temps (1er appui
// = message, 2e = remise à zéro, Échap annule). Tout est annulable (u).
export function useTimer(task: Task) {
  const { act, setUndo } = useActions();
  const [confirmReset, setConfirmReset] = useState(false);
  // Copie à jour pour Échap dans la fiche (gestionnaire Radix d'un rendu précédent).
  const confirmRef = useRef(false);
  confirmRef.current = confirmReset;
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
    setConfirmReset(false);
    const before = { time_spent: task.time_spent, timer_started_at: task.timer_started_at };
    return act(async () => {
      await api.updateTask(task.id, { timer: action });
      setUndo({ label, run: () => api.updateTask(task.id, before), focus: `task:${task.id}` });
    });
  };
  const toggle = () => (running ? run('pause', 'pause du chrono') : run('start', 'lancement du chrono'));
  const reset = () => (confirmReset ? run('reset', 'remise à zéro du chrono') : setConfirmReset(true));
  const cancel = () => setConfirmReset(false);

  // Touches du chrono ; true si la touche a été traitée.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 't') toggle();
    else if (e.key === 'T') reset();
    else return false;
    e.preventDefault();
    return true;
  };

  // La remise à zéro ne sert que s'il y a du temps ou un chrono en marche.
  return { seconds, running, canReset: running || seconds > 0, confirmReset, confirmRef, toggle, reset, cancel, onKey };
}

export type TimerState = ReturnType<typeof useTimer>;

// Temps passé : « 12 min », puis « 2h34 ». Texte normal chrono en marche, atténué sinon.
export function TimeSpent({ seconds, running, className }: { seconds: number; running: boolean; className?: string }) {
  return (
    <span
      className={cn('time-spent flex-none text-xs tabular-nums', running ? 'text-foreground' : 'text-muted-foreground', className)}
      title="Temps passé"
    >
      {formatDuration(seconds)}
    </span>
  );
}

export const RESET_MESSAGE = 'T ou ↻ pour remettre à zéro · Échap pour annuler';

// Boutons du chrono : lancer / pause (bascule : icône pleine en marche), remise à zéro.
export function TimerButtons({ timer, className }: { timer: TimerState; className?: string }) {
  return (
    <span className={cn('timer flex flex-none gap-0.5', className)}>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn('timer-toggle', timer.running ? 'text-foreground' : 'text-muted-foreground')}
        aria-label="Chrono"
        aria-pressed={timer.running}
        title={timer.running ? 'Mettre le chrono en pause (t)' : 'Lancer le chrono (t)'}
        onClick={timer.toggle}
      >
        {timer.running ? <Pause aria-hidden fill="currentColor" /> : <Play aria-hidden />}
      </Button>
      {timer.canReset && (
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('timer-reset hover:text-destructive', timer.confirmReset ? 'text-destructive' : 'text-muted-foreground')}
          aria-label={timer.confirmReset ? 'Confirmer la remise à zéro du chrono' : 'Remettre le chrono à zéro'}
          title={timer.confirmReset ? 'Confirmer la remise à zéro (T)' : 'Arrêter et remettre à zéro (T T)'}
          onClick={timer.reset}
        >
          <RotateCcw aria-hidden />
        </Button>
      )}
    </span>
  );
}
