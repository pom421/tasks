import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BUGTRACKER_KEY_RE, bugtrackerLink, bugtrackerState, formatDuration, type BugtrackerState, isValidTicket, type DoneTask, type JiraFields, type Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions, type TaskField } from '@/lib/actions';
import { record } from '@/lib/history';
import { focusByKey } from '@/lib/nav';
import { renderMarkdown } from '@/lib/markdown';
import { formatDay, isComplete } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimerButtons, useTimer } from './Timer';
import { PlanButton, usePlan } from './Plan';
import { PriorityButton, usePriority } from './Priority';
import { TagInput } from './TagInput';
import { JiraButtons, JiraCompare, jiraBlocker, sameJira, type JiraDirection } from './Jira';

interface TaskDialogProps {
  task: Task | DoneTask;
  projectName: string;
  field: TaskField;
  tagSuggestions: string[]; // tags existants (autocomplétion)
  jira: boolean; // URL des tickets et PAT renseignés : pousser / récupérer possibles
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
}

type Field = 'title' | 'ticket' | 'day' | 'due' | 'notes';

// Report saisi dans la fiche : identifiant = reportée, sinon case cochée = à reporter.
const reportOf = (v: { ticket: string; wanted: boolean }): BugtrackerState => (v.ticket ? 'done' : v.wanted ? 'wanted' : 'none');

// Fiche d'une tâche, façon GitLab : lecture seule par défaut ; e passe tout en
// édition (titre, puis Tab : ticket, case « À reporter », date prévue, échéance, tags, contenu Markdown) ; Ctrl+Entrée
// enregistre et repasse en lecture ; un second Ctrl+Entrée (ou Échap) ferme.
// Chrono comme sur la ligne : c lance / met en pause, C remet à zéro.
// Aujourd’hui comme sur la ligne : t ou ☀.
// Priorité comme sur la ligne : 1, 2, 3 (le même chiffre la retire) ou clic.
// Jira (ticket PROJ-123, URL et PAT renseignés) : > pousse vers Jira, < récupère
// depuis Jira, après une fenêtre de comparaison ; annulable (u).
// Tout est enregistré automatiquement, rien n'est perdu.
// Accessibilité : focus piégé, titre et description annoncés (Radix),
// libellés reliés aux champs, erreurs annoncées.
export function TaskDialog({ task, projectName, field, tagSuggestions, jira, open, onClose }: TaskDialogProps) {
  const id = useId();
  const done = 'done_at' in task;
  const timer = useTimer(task);
  const plan = usePlan(task);
  const priority = usePriority(task);
  const [values, setValues] = useState({
    title: task.title,
    ticket: task.bugtracker_key ?? '',
    wanted: bugtrackerState(task) !== 'none',
    day: task.day_at ?? '',
    due: task.due_at ?? '',
    tags: task.tags,
    notes: task.notes ?? '',
  });
  // Ouverte par e : directement en édition.
  const [editing, setEditing] = useState(field === 'edit');
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const saved = useRef({ ...values, changed: false });
  const refs = {
    title: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
    day: useRef<HTMLInputElement>(null),
    due: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
  };
  const reader = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(values.notes), [values.notes]);
  // Copie toujours à jour des valeurs saisies : Radix appelle parfois un
  // gestionnaire (Échap) d'un rendu précédent, qui enregistrerait un texte périmé.
  const latest = useRef(values);
  const set = (key: Field) => (e: { target: { value: string } }) => {
    latest.current = { ...latest.current, [key]: e.target.value };
    setValues(latest.current);
  };
  // Case « À reporter » : décochée, elle retire aussi l'identifiant ; en lecture,
  // enregistrée tout de suite.
  const setWanted = (wanted: boolean) => {
    latest.current = { ...latest.current, wanted, ticket: wanted ? latest.current.ticket : '' };
    setValues(latest.current);
    if (!editing) persist();
  };
  const setTags = (tags: string[]) => {
    latest.current = { ...latest.current, tags };
    setValues(latest.current);
  };
  // ☀ (t) change la date prévue hors du formulaire : le champ suit, sauf s'il
  // a été modifié entre-temps (la saisie l'emporte).
  useEffect(() => {
    const day = task.day_at ?? '';
    if (day === saved.current.day) return;
    if (latest.current.day === saved.current.day) {
      latest.current = { ...latest.current, day };
      setValues(latest.current);
    }
    saved.current = { ...saved.current, day };
  }, [task.day_at]);

  // Focus à placer dès le prochain affichage (le champ visé n'existe pas encore
  // quand on change de mode). Appliqué juste après le rendu, avant la touche
  // suivante : si on tape vite après e puis Tab, rien ne revient en arrière.
  const focusNext = useRef<Field | 'reader' | null>(null);
  const [, rerender] = useState(0);
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    (target === 'reader' ? reader.current : refs[target].current)?.focus();
  });
  const focusSoon = (target: Field | 'reader') => {
    focusNext.current = target;
    rerender((n) => n + 1);
  };

  // En édition, un champ en erreur est corrigé sur place ; en lecture, on y revient.
  const fail = (f: Field, message: string) => {
    setError({ field: f, message });
    setEditing(true);
    focusSoon(f);
    return false;
  };

  // Enregistrements en file : deux Ctrl+Entrée rapides (lecture puis fermeture)
  // ne lancent pas deux enregistrements concurrents.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const persist = (): Promise<boolean> => (queue.current = queue.current.then(save, save));

  // Enregistre ce qui a changé. false en cas d'erreur (la fiche reste ouverte).
  const save = async (): Promise<boolean> => {
    const values = latest.current;
    const ticket = values.ticket.trim();
    const next = {
      title: values.title.trim(),
      // Identifiant normalisé comme côté serveur (proj-5 → PROJ-5).
      ticket: ticket.toUpperCase(),
      wanted: values.wanted || Boolean(ticket),
      day: values.day,
      due: values.due,
      tags: values.tags,
      notes: values.notes.trim(),
    };
    if (!next.title) return fail('title', 'Le titre est obligatoire');
    if (!isValidTicket(next.ticket)) return fail('ticket', 'Identifiant attendu, ex. PROJ-123');
    if (!isComplete(next.day)) return fail('day', 'Date invalide');
    if (!isComplete(next.due)) return fail('due', 'Date invalide');
    const patch: Parameters<typeof api.updateTask>[1] = {};
    if (next.title !== saved.current.title) patch.title = next.title;
    if (next.ticket !== saved.current.ticket) patch.bugtracker_ticket = next.ticket || null;
    // Reportée vient de l'identifiant (base) ; à reporter / rien, de la case.
    const report = reportOf(next);
    const savedReport = reportOf(saved.current);
    if (report !== savedReport && report !== 'done') patch.bugtracker = report;
    if (next.day !== saved.current.day) patch.day_at = next.day || null;
    if (next.due !== saved.current.due) patch.due_at = next.due || null;
    if (next.tags.join() !== saved.current.tags.join()) patch.tags = next.tags;
    if (next.notes !== saved.current.notes.trim()) patch.notes = next.notes || null;
    if (!Object.keys(patch).length) return true;
    // Valeurs d'avant, pour annuler (u) une fois la fiche fermée.
    const before: typeof patch = {};
    if ('title' in patch) before.title = saved.current.title;
    if ('bugtracker_ticket' in patch) before.bugtracker_ticket = saved.current.ticket || null;
    if (report !== savedReport && savedReport !== 'done') before.bugtracker = savedReport;
    if ('day_at' in patch) before.day_at = saved.current.day || null;
    if ('due_at' in patch) before.due_at = saved.current.due || null;
    if ('tags' in patch) before.tags = saved.current.tags;
    if ('notes' in patch) before.notes = saved.current.notes.trim() || null;
    try {
      await api.updateTask(task.id, patch);
      record({
        label: 'modification de la fiche',
        focus: `task:${task.id}`,
        undo: () => api.updateTask(task.id, before),
        redo: () => api.updateTask(task.id, patch),
      });
      saved.current = { ...next, changed: true };
      latest.current = { ...latest.current, ticket: next.ticket, wanted: next.wanted };
      setValues(latest.current);
      setError(null);
      return true;
    } catch (err) {
      const f: Field = patch.bugtracker_ticket !== undefined ? 'ticket' : patch.day_at !== undefined ? 'day' : patch.due_at !== undefined ? 'due' : 'title';
      return fail(f, (err as Error).message);
    }
  };

  // Jira : comparaison ouverte (valeurs du ticket lues à l'instant), message.
  const ticketKey = BUGTRACKER_KEY_RE.test(values.ticket.trim().toUpperCase()) ? values.ticket.trim().toUpperCase() : null;
  const blocker = jiraBlocker(ticketKey, jira);
  // Lien du ticket en lecture, comme le badge de la ligne : clé + URL de base.
  const { settings } = useActions();
  const ticketLink = bugtrackerLink({ bugtracker_key: ticketKey }, settings);
  const [compare, setCompare] = useState<{ direction: JiraDirection; key: string; local: JiraFields; remote: JiraFields } | null>(null);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<{ ok?: string; error?: string }>({});
  const localJira = (): JiraFields => ({ title: saved.current.title, notes: saved.current.notes.trim() || null, due_at: saved.current.due || null });

  // 1er temps : enregistre la fiche, lit le ticket et ouvre la comparaison.
  const startJira = async (direction: JiraDirection) => {
    if (blocker || !ticketKey || jiraBusy) return;
    setJiraStatus({});
    if (!(await persist())) return;
    setJiraBusy(true);
    try {
      const remote = await api.jiraIssue(ticketKey);
      const local = localJira();
      if (sameJira(local, remote)) setJiraStatus({ ok: 'Déjà identique dans Jira.' });
      else setCompare({ direction, key: ticketKey, local, remote });
    } catch (err) {
      setJiraStatus({ error: (err as Error).message });
    } finally {
      setJiraBusy(false);
    }
  };

  // 2e temps (confirmé) : écrit dans Jira ou dans la tâche, annulable (u).
  const confirmJira = async () => {
    if (!compare) return;
    const { direction, key, local, remote } = compare;
    setJiraBusy(true);
    try {
      if (direction === 'push') {
        await api.updateJiraIssue(key, local);
        record({
          label: 'envoi vers Jira',
          focus: `task:${task.id}`,
          undo: () => api.updateJiraIssue(key, remote),
          redo: () => api.updateJiraIssue(key, local),
        });
        setJiraStatus({ ok: `Poussé vers Jira (${key}).` });
      } else {
        const patch = { title: remote.title, notes: remote.notes, due_at: remote.due_at };
        await api.updateTask(task.id, patch);
        record({
          label: 'récupération depuis Jira',
          focus: `task:${task.id}`,
          undo: () => api.updateTask(task.id, local),
          redo: () => api.updateTask(task.id, patch),
        });
        const fields = { title: remote.title, notes: remote.notes ?? '', due: remote.due_at ?? '' };
        saved.current = { ...saved.current, ...fields, changed: true };
        latest.current = { ...latest.current, ...fields };
        setValues(latest.current);
        setJiraStatus({ ok: `Récupéré depuis Jira (${key}).` });
      }
    } catch (err) {
      setJiraStatus({ error: (err as Error).message });
    } finally {
      setJiraBusy(false);
      setCompare(null);
      focusSoon('reader');
    }
  };

  const close = async () => {
    if (await persist()) onClose(saved.current.changed);
  };

  const startEditing = (focus: Field = 'title') => {
    setEditing(true);
    focusSoon(focus);
  };
  // Passage en lecture immédiat ; une erreur d'enregistrement ramène en édition.
  const stopEditing = async () => {
    setEditing(false);
    focusSoon('reader');
    await persist();
  };

  // Entrée dans le titre ou le ticket : comme Ctrl+Entrée.
  const onInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    stopEditing();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inField = (e.target as HTMLElement).matches('input, textarea');
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && timer.onKey(e)) return;
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && plan.onKey(e)) return;
    if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && priority.onKey(e)) return;
    if ((e.key === '>' || e.key === '<') && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startJira(e.key === '>' ? 'push' : 'pull');
      return;
    }
    if (e.key === 'e' && !editing && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startEditing();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (editing) stopEditing();
      else close();
    }
  };

  const state = done ? `faite le ${task.done_at.split('-').reverse().join('/')}` : 'à faire';
  const errorFor = (f: Field) =>
    error?.field === f && (
      <p id={`${id}-${f}-error`} role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  // Case « À reporter », en lecture comme en édition ; cochée d'office avec un identifiant.
  const wantedCheck = (
    <span className="flex items-center gap-1.5">
      <Checkbox
        id={`${id}-wanted`}
        className="report-check"
        checked={values.wanted || Boolean(values.ticket.trim())}
        onCheckedChange={(v) => setWanted(v === true)}
        title="À reporter (filtre R) ; avec un identifiant, la tâche est reportée"
      />
      <Label htmlFor={`${id}-wanted`} className="font-normal">
        À reporter
      </Label>
    </span>
  );
  const invalid = (f: Field) => ({
    'aria-invalid': error?.field === f,
    'aria-describedby': error?.field === f ? `${id}-${f}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className="task-dialog top-[5vh] flex max-h-[90vh] translate-y-0 flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        // Échap : fermer en enregistrant (et rester ouvert en cas d'erreur).
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ({ notes: reader, edit: refs.title }[field].current as HTMLElement | null)?.focus();
        }}
        // À la fermeture, retour sur la tâche dans la liste pour reprendre la navigation.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`task:${task.id}`);
        }}
      >
        {/* Même disposition en lecture et en édition : titre en haut (jusqu'à la
            croix), puis projet et icônes. En édition, le champ prend la place du
            titre, qui reste annoncé par Radix. */}
        <DialogTitle className={cn('pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>
          {values.title}
        </DialogTitle>
        {editing && (
          <div className="grid gap-1.5 pr-6">
            <Input
              ref={refs.title}
              id={`${id}-title`}
              aria-label="Titre"
              autoComplete="off"
              className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-0 text-lg leading-snug font-semibold shadow-none focus-visible:border-primary focus-visible:ring-0 md:text-lg dark:bg-transparent"
              value={values.title}
              onChange={set('title')}
              onKeyDown={onInputEnter}
              {...invalid('title')}
            />
            {errorFor('title')}
          </div>
        )}
        {/* Icônes de la tâche à droite, comme sur la ligne. */}
        <div className="flex min-h-6 items-center justify-between gap-2">
          <DialogDescription>
            {projectName} · {state}
          </DialogDescription>
          <span className="flex items-center">
            {/* Temps passé, à gauche des icônes : aligné à droite, il s'allonge vers
                la gauche sans déplacer les icônes. Texte normal chrono en marche. */}
            {(timer.running || timer.seconds > 0) && (
              <span
                className={cn('time-spent mr-1 flex items-center gap-0.5 text-sm tabular-nums', timer.running ? 'text-foreground' : 'text-muted-foreground')}
                title={timer.running ? 'Temps passé, chrono en marche' : 'Temps passé'}
              >
                <Hourglass aria-hidden className="size-3.5" />
                {formatDuration(timer.seconds)}
              </span>
            )}
            {!done && <TimerButtons timer={timer} />}
            {!done && <PlanButton plan={plan} />}
            <PriorityButton priority={task.priority} onClick={priority.cycle} />
            <JiraButtons blocker={blocker} onClick={startJira} />
          </span>
        </div>

        {editing ? (
          <>
            {/* Ticket, date prévue et échéance sur une ligne (écran large). */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid content-start gap-1.5">
                <Label htmlFor={`${id}-ticket`}>Ticket</Label>
                <Input
                  ref={refs.ticket}
                  id={`${id}-ticket`}
                  placeholder="PROJ-123"
                  autoComplete="off"
                  value={values.ticket}
                  onChange={set('ticket')}
                  onKeyDown={onInputEnter}
                  {...invalid('ticket')}
                />
                {errorFor('ticket')}
                {wantedCheck}
              </div>
              {(['day', 'due'] as const).map((f) => (
                <div key={f} className="grid content-start gap-1.5">
                  <Label htmlFor={`${id}-${f}`}>{f === 'day' ? 'Date prévue' : 'Échéance'}</Label>
                  <Input
                    ref={refs[f]}
                    id={`${id}-${f}`}
                    type="date"
                    title={f === 'day' ? 'Quand je compte la faire (aujourd’hui : dans Aujourd’hui)' : 'Date limite, imposée de l’extérieur'}
                    value={values[f]}
                    onChange={set(f)}
                    onKeyDown={onInputEnter}
                    {...invalid(f)}
                  />
                  {errorFor(f)}
                </div>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-tags`}>Tags</Label>
              <TagInput
                id={`${id}-tags`}
                tags={values.tags}
                suggestions={tagSuggestions}
                onChange={setTags}
                label="Tags"
                placeholder="Ajouter un tag…"
                create
                removeLabel={(tag) => `Retirer le tag ${tag}`}
                className="min-h-9 px-3 py-1"
              />
            </div>
            <div className="grid min-h-0 flex-1 gap-1.5">
              <Label htmlFor={`${id}-notes`}>Contenu</Label>
              <Textarea
                ref={refs.notes}
                id={`${id}-notes`}
                className="min-h-[35vh] font-mono text-sm"
                value={values.notes}
                onChange={set('notes')}
                aria-describedby={`${id}-hint`}
              />
            </div>
          </>
        ) : (
          <div
            ref={reader}
            tabIndex={-1}
            className="reader grid min-h-0 flex-1 gap-4 outline-none"
            aria-describedby={`${id}-hint`}
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Ticket :</dt>
              <dd className="flex items-center gap-3">
                {wantedCheck}
                {values.ticket && (
                  <span className="ticket-value font-mono">
                    {ticketLink ? (
                      <a
                        className="ticket-link text-primary underline-offset-2 hover:underline"
                        href={ticketLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir le ticket"
                      >
                        {values.ticket}
                      </a>
                    ) : (
                      values.ticket
                    )}
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Date prévue :</dt>
              <dd className="day-value first-letter:uppercase">{values.day ? formatDay(values.day) : 'aucune'}</dd>
              <dt className="text-muted-foreground">Échéance :</dt>
              <dd className="due-value first-letter:uppercase">{values.due ? formatDay(values.due) : 'aucune'}</dd>
              <dt className="text-muted-foreground">Tags :</dt>
              <dd className="tags-value">{values.tags.length ? values.tags.map((t) => `#${t}`).join(' ') : 'aucun'}</dd>
            </dl>
            <div
              className={cn(
                'notes-preview markdown min-h-[35vh] overflow-y-auto rounded-md border px-3 py-2 text-sm',
                !values.notes.trim() && 'text-muted-foreground italic',
              )}
              onDoubleClick={() => startEditing('notes')}
              {...(values.notes.trim() ? { dangerouslySetInnerHTML: { __html: html } } : { children: 'Aucun contenu.' })}
            />
          </div>
        )}

        {jiraStatus.ok && (
          <p role="status" className="jira-status text-sm text-muted-foreground">
            {jiraStatus.ok}
          </p>
        )}
        {jiraStatus.error && (
          <p role="alert" className="jira-status text-sm text-destructive">
            {jiraStatus.error}
          </p>
        )}
        {compare && (
          <JiraCompare
            direction={compare.direction}
            ticketKey={compare.key}
            local={compare.local}
            remote={compare.remote}
            busy={jiraBusy}
            onConfirm={confirmJira}
            onCancel={() => {
              setCompare(null);
              focusSoon('reader');
            }}
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {editing
              ? 'Tab : champ suivant · Ctrl+Entrée : enregistrer et repasser en lecture'
              : 'e : modifier · Ctrl+Entrée ou Échap : fermer'}
          </p>
          <DialogFooter>
            <Button type="button" onClick={close}>
              Fermer
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
