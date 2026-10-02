import { useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { bugtrackerState, isValidTicket, type Task } from '../../shared/types.ts';
import { api, type TaskPatch } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { REPORT_BASE, REPORT_WANTED, ReportBadge } from './ReportBadge';

// Report d'une tâche, partagé par la ligne (r) et la fiche (clic) :
// rien -> à reporter -> identifiant demandé : reportée -> rien. Saisie abandonnée
// (Échap, vide, invalide, clic ailleurs) : retour à rien. Annulable (u).
export function useReport(task: Task) {
  const { undoable } = useActions();
  const [asking, setAsking] = useState(false);
  const askingNow = useRef(false); // champ demandé (ouvert, ou en attente des enregistrements)
  const change = (label: string, patch: TaskPatch, before: TaskPatch) =>
    undoable({
      label,
      focus: `task:${task.id}`,
      run: () => api.updateTask(task.id, patch),
      undo: () => api.updateTask(task.id, before),
    });
  // r tapé plusieurs fois vite : chaque appui part du dernier état demandé
  // (pas de celui encore affiché) et les requêtes s'enchaînent dans l'ordre.
  const j = useRef({ state: bugtrackerState(task), pending: 0, queue: Promise.resolve() }).current;
  if (!j.pending) j.state = bugtrackerState(task);
  const cycle = () => {
    // À reporter → reportée : il faut l'identifiant, demandé sur place.
    // Ouvert après les enregistrements en cours : leur retour du focus le refermerait.
    if (j.state === 'wanted') {
      askingNow.current = true;
      j.queue = j.queue.then(() => setAsking(true));
      return;
    }
    const next = j.state === 'none' ? 'wanted' : 'none';
    j.state = next;
    j.pending++;
    j.queue = j.queue.then(async () => {
      if (next === 'wanted') await change('à reporter', { bugtracker: 'wanted' }, { bugtracker: 'none' });
      else await change('retrait du report', { bugtracker: 'none' }, { bugtracker_ticket: task.bugtracker_key });
      j.pending--;
    });
  };
  const save = (key: string) => change('reportée', { bugtracker_ticket: key }, { bugtracker_ticket: null });
  // Champ fermé ; abandonné (Échap, vide, invalide), retour à rien ; focus
  // perdu (clic ailleurs) : reste à reporter.
  const stopAsking = (saved: boolean | null) => {
    if (!askingNow.current) return;
    askingNow.current = false;
    setAsking(false);
    if (saved === false) change('retrait du report', { bugtracker: 'none' }, { bugtracker: 'wanted' });
  };
  return { state: bugtrackerState(task), asking, cycle, save, stopAsking };
}

// Report dans la fiche : un seul contrôle, à la place du ticket. Clic sur
// « aucun » : à reporter ; clic sur « à reporter » : champ de l'identifiant ;
// reportée : pastille du ticket et ✕ pour retirer le report.
export function ReportControl({ task, report }: { task: Task; report: ReturnType<typeof useReport> }) {
  const button = useRef<HTMLButtonElement>(null);
  // Champ refermé : le focus revient sur le contrôle (après son affichage).
  const refocus = useRef(false);
  useLayoutEffect(() => {
    if (!refocus.current || report.asking) return;
    refocus.current = false;
    button.current?.focus();
  });
  if (report.asking) {
    return (
      <TicketInput
        onSave={report.save}
        onClose={(saved) => {
          refocus.current = true;
          report.stopAsking(saved);
        }}
      />
    );
  }
  if (report.state === 'done') {
    return (
      <span className="report-control flex items-center gap-0.5">
        <ReportBadge task={task} />
        <Button
          ref={button}
          variant="ghost"
          size="icon-xs"
          className="size-5 text-muted-foreground"
          title="Retirer le report (et l’identifiant)"
          aria-label="Retirer le report"
          onClick={report.cycle}
        >
          <X aria-hidden />
        </Button>
      </span>
    );
  }
  const wanted = report.state === 'wanted';
  return (
    <button
      ref={button}
      type="button"
      className={cn(
        REPORT_BASE,
        'report-control cursor-pointer',
        wanted ? REPORT_WANTED : 'border-muted-foreground/40 text-muted-foreground hover:text-foreground',
      )}
      title={wanted ? 'Saisir l’identifiant du ticket (reportée)' : 'Marquer à reporter'}
      onClick={report.cycle}
    >
      {wanted ? 'à reporter' : 'aucun'}
    </button>
  );
}

// Ticket saisi sur place (tâche à reporter, projet sur r) : Entrée
// l'enregistre s'il a changé (vide : retire celui d'avant) ; Échap, un clic
// ailleurs ou un identifiant invalide (message) abandonne. onClose(saved) :
// true = un identifiant va être enregistré, false = abandon (Échap, vide,
// invalide), null = focus perdu (clic ailleurs).
export function TicketInput({
  defaultValue = '',
  className,
  onSave,
  onClose,
}: {
  defaultValue?: string;
  className?: string;
  onSave: (ticket: string) => void;
  onClose: (saved: boolean | null) => void;
}) {
  const { toast } = useActions();
  // Fermé une seule fois : rendre le focus ailleurs fait perdre le focus au champ
  // (onBlur) juste après Entrée ou Échap.
  const closed = useRef(false);
  const close = (saved: boolean | null) => {
    if (closed.current) return;
    closed.current = true;
    onClose(saved);
  };
  return (
    <input
      className={cn(
        'ticket-input w-32 flex-none rounded-full border border-primary/60 bg-transparent px-1.5 font-mono text-[11px] leading-[18px] outline-none placeholder:font-sans placeholder:text-muted-foreground',
        className,
      )}
      aria-label="Ticket"
      title="Identifiant du ticket, ex. PROJ-123 (Entrée : enregistrer · Échap : abandonner)"
      placeholder="Ticket, ex. PROJ-123"
      autoComplete="off"
      autoFocus
      defaultValue={defaultValue}
      onBlur={() => close(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation(); // pas de réinitialisation des filtres
          close(false);
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const ticket = e.currentTarget.value.trim();
        const valid = isValidTicket(ticket);
        close(valid && ticket !== defaultValue);
        if (!valid) toast('Identifiant attendu, ex. PROJ-123');
        else if (ticket !== defaultValue) onSave(ticket);
      }}
    />
  );
}
