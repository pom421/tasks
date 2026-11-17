import { useRef, type KeyboardEvent } from 'react';
import { CloudDownload, CloudUpload } from 'lucide-react';
import type { JiraFields } from '../../shared/types.ts';
import { formatDay } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';

export type JiraDirection = 'push' | 'pull';

const ACTIONS = {
  push: { label: 'Pousser vers Jira', key: '>', Icon: CloudUpload },
  pull: { label: 'Récupérer depuis Jira', key: '<', Icon: CloudDownload },
};

// Pourquoi les boutons sont désactivés (null : utilisables).
export function jiraBlocker(ticketKey: string | null, ready: boolean): string | null {
  if (!ticketKey) return 'renseigner l’identifiant du ticket (PROJ-123)';
  if (!ready) return 'renseigner l’URL des tickets et le PAT dans les Réglages';
  return null;
}

// Icônes ☁↑ / ☁↓ de la fiche : désactivées tant qu'il manque l'identifiant
// du ticket, l'URL ou le PAT (la raison est dans l'info-bulle).
export function JiraButtons({ blocker, onClick }: { blocker: string | null; onClick: (d: JiraDirection) => void }) {
  return (['push', 'pull'] as const).map((d) => {
    const { label, key, Icon } = ACTIONS[d];
    return (
      <Button
        key={d}
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className={`jira-${d} flex-none text-muted-foreground`}
        aria-label={label}
        title={blocker ? `${label} (${key}) : ${blocker}` : `${label} (${key})`}
        disabled={Boolean(blocker)}
        onClick={() => onClick(d)}
      >
        <Icon aria-hidden />
      </Button>
    );
  });
}

const FIELDS: { name: string; show: (f: JiraFields) => string; long?: boolean }[] = [
  { name: 'Titre', show: (f) => f.title },
  { name: 'Échéance', show: (f) => (f.due_at ? formatDay(f.due_at) : 'aucune') },
  { name: 'Sprint', show: (f) => f.sprint ?? 'aucun' },
  { name: 'Contenu', show: (f) => f.notes ?? 'aucun', long: true },
];

export const sameJira = (a: JiraFields, b: JiraFields) => FIELDS.every((f) => f.show(a) === f.show(b));

// Fenêtre de comparaison avant de pousser ou de récupérer : valeurs de la
// tâche et du ticket côte à côte, champs identiques atténués.
// Confirmer : bouton, Entrée (il a le focus) ou la même touche (> ou <) ;
// Échap ou Annuler : rien n'est fait.
export function JiraCompare({ direction, ticketKey, local, remote, busy, onConfirm, onCancel }: {
  direction: JiraDirection;
  ticketKey: string;
  local: JiraFields;
  remote: JiraFields;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  const { label, key } = ACTIONS[direction];
  // Les touches ne remontent pas à la fiche (e, c, t… y ont un sens).
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === key) {
      e.preventDefault();
      if (!busy) onConfirm();
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="jira-compare flex max-h-[85vh] flex-col sm:max-w-4xl"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirm.current?.focus();
        }}
      >
        <DialogTitle>
          {label} : {ticketKey}
        </DialogTitle>
        <DialogDescription>
          {direction === 'push' ? 'Les valeurs de la tâche remplaceront celles du ticket Jira.' : 'Les valeurs du ticket Jira remplaceront celles de la tâche.'}
        </DialogDescription>
        <div className="grid min-h-0 grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-2 overflow-y-auto text-sm">
          <span />
          <span className="font-semibold">Tâche{direction === 'push' && ' →'}</span>
          <span className="font-semibold">{direction === 'pull' && '← '}Jira</span>
          {FIELDS.map((f) => {
            const same = f.show(local) === f.show(remote);
            const cell = cn('[overflow-wrap:anywhere]', f.long && 'max-h-60 overflow-y-auto rounded-md border px-2 py-1 font-mono text-xs whitespace-pre-wrap', same && 'text-muted-foreground');
            return [
              <span key={`${f.name}-name`} className={cn('text-muted-foreground', !same && 'font-medium text-foreground')}>
                {f.name}
                {same && <span className="block text-xs">(identique)</span>}
              </span>,
              <div key={`${f.name}-local`} className={cn('jira-local', cell)}>{f.show(local)}</div>,
              <div key={`${f.name}-remote`} className={cn('jira-remote', cell)}>{f.show(remote)}</div>,
            ];
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {key} ou Entrée : confirmer · Échap : annuler
          </p>
          <DialogFooter>
            <Button type="button" onClick={onCancel}>
              Annuler
            </Button>
            <Button ref={confirm} type="button" disabled={busy} onClick={onConfirm}>
              {label}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
