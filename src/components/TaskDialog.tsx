import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { DoneTask, JiraFields, Task } from '../../shared/types.ts';
import { api } from '@/lib/api';
import type { TaskField } from '@/lib/actions';
import { record } from '@/lib/history';
import { focusByKey } from '@/lib/nav';
import { renderMarkdown } from '@/lib/markdown';
import { isComplete } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimeSpent, TimerButtons, useTimer } from './Timer';
import { PlanButton, usePlan } from './Plan';
import { PriorityButton, usePriority } from './Priority';
import { TagInput } from './TagInput';
import { SprintInput } from './SprintInput';
import { ReportControl, useReport } from './Report';
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

type Field = 'title' | 'sprint' | 'day' | 'due' | 'notes';

// Aspect d'un champ (Input) pour les contrôles qui n'en sont pas : ticket, temps passé.
const BOX = 'flex h-9 items-center rounded-md border border-input px-3 text-sm shadow-xs';


// Fiche d'une tâche, façon GitLab : lecture seule par défaut ; e passe tout en
// édition (titre, puis Tab : ticket, sprint, date prévue, échéance, tags, contenu
// Markdown). Mêmes champs, à la même place, dans les deux modes : en lecture, ils
// gardent leur aspect mais sont bloqués (double-clic : édition de ce champ). Ctrl+Entrée
// enregistre et repasse en lecture ; un second Ctrl+Entrée (ou Échap) ferme.
// Chrono comme sur la ligne : c lance / met en pause, C remet à zéro.
// Aujourd’hui comme sur la ligne : t ou ☀.
// Priorité comme sur la ligne : 1, 2, 3 (le même chiffre la retire) ou clic.
// Ticket (report), enregistré tout de suite, en lecture comme en édition, comme
// sur la ligne (r ou clic) : aucun → à reporter → identifiant (Échap, vide,
// invalide ou clic ailleurs : retour à aucun) → aucun (r ou ✕).
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
  const report = useReport(task);
  const [values, setValues] = useState({
    title: task.title,
    sprint: task.sprint ?? '',
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
    sprint: useRef<HTMLInputElement>(null),
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
    const next = {
      title: values.title.trim(),
      sprint: values.sprint.trim(),
      day: values.day,
      due: values.due,
      tags: values.tags,
      notes: values.notes.trim(),
    };
    if (!next.title) return fail('title', 'Le titre est obligatoire');
    if (!isComplete(next.day)) return fail('day', 'Date invalide');
    if (!isComplete(next.due)) return fail('due', 'Date invalide');
    const patch: Parameters<typeof api.updateTask>[1] = {};
    if (next.title !== saved.current.title) patch.title = next.title;
    if (next.sprint !== saved.current.sprint.trim()) patch.sprint = next.sprint || null;
    if (next.day !== saved.current.day) patch.day_at = next.day || null;
    if (next.due !== saved.current.due) patch.due_at = next.due || null;
    if (next.tags.join() !== saved.current.tags.join()) patch.tags = next.tags;
    if (next.notes !== saved.current.notes.trim()) patch.notes = next.notes || null;
    if (!Object.keys(patch).length) return true;
    // Valeurs d'avant, pour annuler (u) une fois la fiche fermée.
    const before: typeof patch = {};
    if ('title' in patch) before.title = saved.current.title;
    if ('sprint' in patch) before.sprint = saved.current.sprint.trim() || null;
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
      setError(null);
      return true;
    } catch (err) {
      const f: Field = patch.day_at !== undefined ? 'day' : patch.due_at !== undefined ? 'due' : patch.sprint !== undefined ? 'sprint' : 'title';
      return fail(f, (err as Error).message);
    }
  };

  // Jira : comparaison ouverte (valeurs du ticket lues à l'instant), message.
  const ticketKey = task.bugtracker_key;
  const blocker = jiraBlocker(ticketKey, jira);
  const [compare, setCompare] = useState<{ direction: JiraDirection; key: string; local: JiraFields; remote: JiraFields } | null>(null);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<{ ok?: string; error?: string }>({});
  // Sprints actifs puis à venir du projet du ticket, lus à la première entrée
  // dans le champ Sprint ; sans Jira (ou en erreur) : texte libre seul.
  const [sprints, setSprints] = useState<string[]>([]);
  const sprintsAsked = useRef(false);
  const loadSprints = () => {
    if (blocker || !ticketKey || sprintsAsked.current) return;
    sprintsAsked.current = true;
    api.jiraSprints(ticketKey.split('-')[0]).then(setSprints, () => {});
  };
  const localJira = (): JiraFields => ({
    title: saved.current.title,
    notes: saved.current.notes.trim() || null,
    due_at: saved.current.due || null,
    sprint: saved.current.sprint.trim() || null,
  });

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
        const patch = { title: remote.title, notes: remote.notes, due_at: remote.due_at, sprint: remote.sprint };
        await api.updateTask(task.id, patch);
        record({
          label: 'récupération depuis Jira',
          focus: `task:${task.id}`,
          undo: () => api.updateTask(task.id, local),
          redo: () => api.updateTask(task.id, patch),
        });
        const fields = { title: remote.title, notes: remote.notes ?? '', due: remote.due_at ?? '', sprint: remote.sprint ?? '' };
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

  // Entrée dans le titre, le sprint ou une date : comme Ctrl+Entrée.
  const onInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    stopEditing();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Champ bloqué (lecture) : les touches restent celles de la fiche.
    const inField = (e.target as HTMLElement).matches('input:not([readonly]), textarea');
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && timer.onKey(e)) return;
    if (!inField && !done && !e.ctrlKey && !e.metaKey && !e.altKey && plan.onKey(e)) return;
    if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && priority.onKey(e)) return;
    if ((e.key === '>' || e.key === '<') && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startJira(e.key === '>' ? 'push' : 'pull');
      return;
    }
    if (e.key === 'r' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      report.cycle();
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

  const errorFor = (f: Field) =>
    error?.field === f && (
      <p id={`${id}-${f}-error`} role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  const invalid = (f: Field) => ({
    'aria-invalid': error?.field === f,
    'aria-describedby': error?.field === f ? `${id}-${f}-error` : undefined,
  });
  // Champ bloqué en lecture : ni focus ni saisie (les touches restent à la
  // fiche), double-clic pour le modifier.
  const locked = (f: Field) =>
    editing
      ? {}
      : {
          readOnly: true,
          tabIndex: -1,
          className: 'cursor-default',
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onDoubleClick: () => startEditing(f),
        };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className="task-dialog top-[5vh] flex max-h-[90vh] translate-y-0 flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        // Échap : fermer en enregistrant (et rester ouvert en cas d'erreur).
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          // Échap dans le champ du ticket : abandonne la saisie, la fiche reste ouverte.
          if ((e.target as HTMLElement).matches('.ticket-input')) return;
          // Échap dans un champ à propositions ouvertes : ferme la liste seulement.
          if ((e.target as HTMLElement).matches('[aria-expanded="true"]')) return;
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
        {/* Bordure invisible : même hauteur que le champ du titre (édition). */}
        <DialogTitle className={cn('border-b border-transparent pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>
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
            {projectName}
            {done && ` · faite le ${task.done_at.split('-').reverse().join('/')}`}
          </DialogDescription>
          <span className="flex items-center">
            {!done && <PlanButton plan={plan} />}
            <PriorityButton priority={task.priority} onClick={priority.cycle} />
            <JiraButtons blocker={blocker} onClick={startJira} />
          </span>
        </div>

        {/* Même grille en lecture et en édition, au pixel près : ticket et sprint,
            puis dates et temps passé, puis tags, puis contenu. */}
        <div
          ref={reader}
          tabIndex={editing ? undefined : -1}
          className={cn('grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-4 outline-none', !editing && 'reader')}
          aria-describedby={editing ? undefined : `${id}-hint`}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid content-start gap-1.5">
              <Label>Ticket</Label>
              <div className={BOX}>
                <ReportControl task={task} report={report} />
              </div>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor={`${id}-sprint`}>Sprint</Label>
              <SprintInput
                ref={refs.sprint}
                id={`${id}-sprint`}
                autoComplete="off"
                placeholder={editing ? 'ex. Sprint 42' : 'aucun'}
                title="Sprint du ticket, synchronisé avec Jira (↓ : sprints actifs et à venir)"
                suggestions={sprints}
                value={values.sprint}
                onValue={(value) => set('sprint')({ target: { value } })}
                onFocusCapture={loadSprints}
                onKeyDown={onInputEnter}
                {...invalid('sprint')}
                {...locked('sprint')}
              />
              {errorFor('sprint')}
            </div>
            {(['day', 'due'] as const).map((f) => (
              <div key={f} className={cn('grid content-start gap-1.5', f === 'day' && 'sm:col-start-1')}>
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
                  {...locked(f)}
                />
                {errorFor(f)}
              </div>
            ))}
            {/* Temps passé et chrono (c, C), jamais saisi : même aspect dans les deux modes. */}
            <div className="grid content-start gap-1.5">
              <Label>Temps passé</Label>
              <div className={cn(BOX, 'justify-between pr-1')}>
                {timer.running || timer.seconds ? (
                  <TimeSpent timer={timer} className="[&_svg]:size-3.5" />
                ) : (
                  <span className="text-muted-foreground">aucun</span>
                )}
                {!done && <TimerButtons timer={timer} />}
              </div>
            </div>
            <div className="grid content-start gap-1.5 sm:col-span-3">
              <Label htmlFor={`${id}-tags`}>Tags</Label>
              <TagInput
                id={`${id}-tags`}
                tags={values.tags}
                suggestions={tagSuggestions}
                onChange={setTags}
                label="Tags"
                placeholder={editing ? 'Ajouter un tag…' : 'aucun'}
                create
                readOnly={!editing}
                removeLabel={(tag) => `Retirer le tag ${tag}`}
                className={cn('min-h-9 border-input px-3 py-1 shadow-xs', !editing && 'focus-within:ring-0')}
              />
            </div>
          </div>
          <div className="grid min-h-0 grid-rows-[auto_1fr] gap-1.5">
            <Label htmlFor={editing ? `${id}-notes` : undefined}>Contenu</Label>
            {editing ? (
              <Textarea
                ref={refs.notes}
                id={`${id}-notes`}
                className="min-h-[35vh] font-mono text-sm"
                value={values.notes}
                onChange={set('notes')}
                aria-describedby={`${id}-hint`}
              />
            ) : (
              <div
                className={cn(
                  'notes-preview markdown min-h-[35vh] overflow-y-auto rounded-md border border-input px-3 py-2 text-sm shadow-xs',
                  // Vide : « Aucun contenu » au centre, un peu plus gros.
                  !values.notes.trim() && 'flex items-center justify-center text-base text-muted-foreground',
                )}
                onDoubleClick={() => startEditing('notes')}
                {...(values.notes.trim() ? { dangerouslySetInnerHTML: { __html: html } } : { children: 'Aucun contenu' })}
              />
            )}
          </div>
        </div>

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
