import { useRef, type KeyboardEvent } from 'react';
import { CloudDownload, CloudUpload, TicketPlus } from 'lucide-react';
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

// Icônes Jira de la fiche : seulement celles qui servent (cliquables), sans
// URL ni PAT aucune. Avec un identifiant : ☁↑ pousser, ☁↓ récupérer. Sans
// identifiant mais avec un ticket de projet (l'epic) : un seul bouton « + » qui
// crée le ticket dans Jira.
export function JiraButtons({ ready, ticketKey, canCreate, onClick, onCreate }: {
  ready: boolean;
  ticketKey: string | null;
  canCreate: boolean;
  onClick: (d: JiraDirection) => void;
  onCreate: () => void;
}) {
  if (!ready) return null;
  if (!ticketKey) {
    return canCreate ? (
      <Button
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className="jira-create flex-none text-muted-foreground"
        aria-label="Créer le ticket dans Jira"
        title="Créer le ticket dans Jira : une tâche rattachée au ticket du projet"
        onClick={onCreate}
      >
        <TicketPlus aria-hidden />
      </Button>
    ) : null;
  }
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
        title={`${label} (${key})`}
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

// Fenêtre de confirmation avant de créer le ticket : ce qui sera envoyé.
// Entrée (le bouton a le focus) ou le bouton confirme, Échap ou Annuler : rien n'est fait.
export function JiraCreate({ epicKey, projectName, fields, busy, onConfirm, onCancel }: {
  epicKey: string;
  projectName: string;
  fields: JiraFields;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="jira-create-dialog flex max-h-[85vh] flex-col sm:max-w-2xl"
        onKeyDown={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirm.current?.focus();
        }}
      >
        <DialogTitle>Créer le ticket dans Jira</DialogTitle>
        <DialogDescription>
          Une tâche sera créée dans Jira, rattachée à {epicKey} (ticket du projet {projectName}). Elle ne pourra pas être supprimée d’ici.
        </DialogDescription>
        <div className="grid min-h-0 grid-cols-[auto_1fr] gap-x-4 gap-y-2 overflow-y-auto text-sm">
          {FIELDS.map((f) => [
            <span key={`${f.name}-name`} className="text-muted-foreground">{f.name}</span>,
            <div key={`${f.name}-value`} className={cn('jira-new [overflow-wrap:anywhere]', f.long && 'max-h-60 overflow-y-auto rounded-md border px-2 py-1 font-mono text-xs whitespace-pre-wrap')}>
              {f.show(fields)}
            </div>,
          ])}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Entrée : créer · Échap : annuler</p>
          <DialogFooter>
            <Button type="button" onClick={onCancel}>
              Annuler
            </Button>
            <Button ref={confirm} type="button" disabled={busy} onClick={onConfirm}>
              Créer le ticket
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
