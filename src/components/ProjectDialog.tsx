import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ListChecks, Pin, Plus } from 'lucide-react';
import { BUGTRACKER_KEY_RE, bugtrackerLink, isValidTicket, type Project, type Reviews } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { useActions, type ProjectField } from '@/lib/actions';
import { record } from '@/lib/history';
import { focusByKey } from '@/lib/nav';
import { TASK_LINK, renderMarkdown } from '@/lib/markdown';
import { formatDay, localToday } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PriorityIcon } from './Priority';

interface ProjectDialogProps {
  project: Project;
  field: ProjectField;
  day?: string | null; // bilan affiché à l'ouverture (sinon le plus récent)
  open: boolean;
  // changed : quelque chose a été enregistré (les données sont à recharger).
  onClose: (changed: boolean) => void;
  // Lien de la synthèse vers une tâche ; day : bilan affiché, pour y revenir.
  onOpenTask: (id: number, day: string | null) => void;
}

// Lien Markdown vers la fiche d'une tâche (#tache-12).
const taskLink = (id: number) => `(#tache-${id})`;
// Lignes de liste Markdown, une par tâche : titre lié à sa fiche.
const taskLines = (tasks: { id: number; title: string }[]) =>
  tasks.map((t) => `- [${t.title.replace(/[[\]]/g, '\\$&')}]${taskLink(t.id)}`).join('\n');

type Field = 'name' | 'ticket' | 'notes' | 'done' | 'next';
type Values = Record<Field, string>;

// Fiche d'un projet, comme celle d'une tâche (même clavier, même disposition) :
// lecture seule par défaut ; e passe en édition (nom, puis Tab : ticket,
// repères, bilan) ; Ctrl+Entrée enregistre et repasse en lecture ; un second
// Ctrl+Entrée (ou Échap) ferme. Enregistrement automatique, annulable (u).
// Synthèse = repères (le projet, ses liens : non datés, repliés par défaut ; la
// ligne « 📌 Repères », pleine s'ils sont remplis, les déplie : clic, ou Tab puis Entrée) + bilans datés, créés au besoin
// (« Nouveau bilan » ou s : celui du jour), un par jour au plus : « Fait
// dernièrement » puis « Prochainement », l'un sous l'autre, modifiables ensemble ;
// ← → (ou les flèches, toujours visibles en haut) passent d'un bilan à l'autre.
// Le corps défile, l'en-tête et le pied restent dans la fenêtre. Boutons
// d'insertion : tâches faites depuis le bilan d'avant, P1 à faire, en liens.
export function ProjectDialog({ project, field, day: dayProp, open, onClose, onOpenTask }: ProjectDialogProps) {
  const id = useId();
  const { settings } = useActions();
  const today = useMemo(localToday, []);
  const [values, setValues] = useState<Values>({
    name: project.name,
    ticket: project.bugtracker_key ?? '',
    notes: project.notes ?? '',
    done: '',
    next: '',
  });
  const [editing, setEditing] = useState(field !== 'notes');
  // Repères dépliés (repliés à chaque ouverture).
  const [showNotes, setShowNotes] = useState(false);
  // Bilans enregistrés (du plus ancien au plus récent), lus à l'ouverture.
  const [data, setData] = useState<Reviews | null>(null);
  // Bilan affiché : null = aucun ; un jour sans bilan enregistré = nouveau bilan (brouillon).
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  // Dernières valeurs enregistrées ; day : jour du bilan qu'elles concernent.
  const saved = useRef({ ...values, day: null as string | null, changed: false });
  const refs = {
    name: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLTextAreaElement>(null),
    done: useRef<HTMLTextAreaElement>(null),
    next: useRef<HTMLTextAreaElement>(null),
  };
  const reader = useRef<HTMLDivElement>(null);
  // Copie toujours à jour des valeurs saisies (voir TaskDialog).
  const latest = useRef(values);
  const set = (key: Field) => (e: { target: { value: string } }) => {
    latest.current = { ...latest.current, [key]: e.target.value };
    setValues(latest.current);
  };

  // Focus à placer juste après le prochain rendu (voir TaskDialog).
  const focusNext = useRef<Field | 'reader' | null>(null);
  const [, rerender] = useState(0);
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    const element = target === 'reader' ? reader.current : refs[target].current;
    if (!element) return; // zone pas encore affichée (bilans en cours de lecture)
    focusNext.current = null;
    element.focus();
  });
  const focusSoon = (target: Field | 'reader') => {
    focusNext.current = target;
    rerender((n) => n + 1);
  };

  // Affiche le bilan d'un jour (null : aucun), sans rien enregistrer.
  const show = (d: string | null, reviews = data?.reviews ?? []) => {
    const review = reviews.find((r) => r.day === d);
    const zones = { done: review?.done ?? '', next: review?.next ?? '' };
    saved.current = { ...saved.current, ...zones, day: d };
    latest.current = { ...latest.current, ...zones };
    setValues(latest.current);
    setDay(d);
  };

  // Ouverture : bilan demandé (retour depuis une tâche), celui du jour (s), sinon le plus récent.
  useEffect(() => {
    api.reviews(project.id).then(
      (loaded) => {
        setData(loaded);
        show(field === 'summary' ? today : (dayProp ?? loaded.reviews.at(-1)?.day ?? null), loaded.reviews);
      },
      () => setData({ reviews: [], done: [] }),
    );
  }, [project.id]); // une seule lecture, à l'ouverture

  const fail = (f: Field, message: string) => {
    setError({ field: f, message });
    setEditing(true);
    focusSoon(f);
    return false;
  };

  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const persist = (): Promise<boolean> => (queue.current = queue.current.then(save, save));

  // Enregistre ce qui a changé (projet, bilan affiché). false en cas d'erreur (la fiche reste ouverte).
  const save = async (): Promise<boolean> => {
    const values = latest.current;
    const next = {
      name: values.name.trim(),
      ticket: values.ticket.trim().toUpperCase(), // normalisé comme côté serveur (proj-5 → PROJ-5)
      notes: values.notes.trim(),
      done: values.done.trim(),
      next: values.next.trim(),
    };
    if (!next.name) return fail('name', 'Le nom est obligatoire');
    if (!isValidTicket(next.ticket)) return fail('ticket', 'Identifiant attendu, ex. PROJ-123');
    const patch: Parameters<typeof api.updateProject>[1] = {};
    if (next.name !== saved.current.name) patch.name = next.name;
    if (next.ticket !== saved.current.ticket) patch.bugtracker_ticket = next.ticket || null;
    if (next.notes !== saved.current.notes.trim()) patch.notes = next.notes || null;
    const reviewDay = saved.current.day;
    const reviewChanged =
      reviewDay !== null && (next.done !== saved.current.done.trim() || next.next !== saved.current.next.trim());
    if (!Object.keys(patch).length && !reviewChanged) return true;
    const before: typeof patch = {};
    if ('name' in patch) before.name = saved.current.name;
    if ('bugtracker_ticket' in patch) before.bugtracker_ticket = saved.current.ticket || null;
    if ('notes' in patch) before.notes = saved.current.notes.trim() || null;
    const review = reviewChanged ? { day: reviewDay, done: next.done, next: next.next } : null;
    const reviewBefore = reviewChanged
      ? { day: reviewDay, done: saved.current.done.trim(), next: saved.current.next.trim() }
      : null;
    const write = async (p: typeof patch, r: typeof review) => {
      if (Object.keys(p).length) await api.updateProject(project.id, p);
      if (r) await api.saveReview(project.id, r);
    };
    try {
      await write(patch, review);
      record({
        label: 'modification de la fiche du projet',
        focus: `project:${project.id}`,
        undo: () => write(before, reviewBefore),
        redo: () => write(patch, review),
      });
      if (review) {
        // Bilan aux deux zones vides : retiré (le serveur fait de même).
        setData((d) => {
          const others = (d?.reviews ?? []).filter((r) => r.day !== review.day);
          const kept = review.done || review.next ? [...others, review] : others;
          return { done: d?.done ?? [], reviews: kept.sort((a, b) => a.day.localeCompare(b.day)) };
        });
      }
      saved.current = { ...saved.current, ...next, changed: true };
      latest.current = { ...latest.current, ticket: next.ticket };
      setValues(latest.current);
      setError(null);
      return true;
    } catch (err) {
      return fail(patch.bugtracker_ticket !== undefined ? 'ticket' : 'name', (err as Error).message);
    }
  };

  const close = async () => {
    if (await persist()) onClose(saved.current.changed);
  };
  const startEditing = (focus: Field = 'name') => {
    setEditing(true);
    focusSoon(focus);
  };
  const stopEditing = async () => {
    setEditing(false);
    focusSoon('reader');
    await persist();
  };

  // Bilans à parcourir : ceux enregistrés, plus le nouveau bilan affiché.
  const days = useMemo(() => {
    const saved = (data?.reviews ?? []).map((r) => r.day);
    return day && !saved.includes(day) ? [...saved, day].sort() : saved;
  }, [data, day]);
  const index = day ? days.indexOf(day) : -1;
  const previousDay = index > 0 ? days[index - 1] : null;
  const nextDay = index >= 0 && index < days.length - 1 ? days[index + 1] : null;
  // Change de bilan, après avoir enregistré celui affiché.
  const goTo = async (d: string | null) => {
    if (!d || d === day || !(await persist())) return;
    show(d);
    if (editing) focusSoon('done');
  };
  // Bilan du jour (s, « Nouveau bilan ») : en édition, curseur dans « Fait dernièrement ».
  const reviewToday = async () => {
    if (!data || !(await persist())) return;
    if (day !== today) show(today);
    startEditing('done');
  };

  // Déplie / replie les repères ; dépliés en édition : curseur dedans.
  const toggleNotes = () => {
    setShowNotes(!showNotes);
    if (!showNotes && editing) focusSoon('notes');
  };

  // Entrée dans le nom ou le ticket : comme Ctrl+Entrée.
  const onInputEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    void stopEditing();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inField = (e.target as HTMLElement).matches('input, textarea, select');
    const plain = !inField && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && e.key === 'e' && !editing) {
      e.preventDefault();
      startEditing();
      return;
    }
    if (plain && e.key === 's') {
      e.preventDefault();
      void reviewToday();
      return;
    }
    if (plain && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      void goTo(e.key === 'ArrowLeft' ? previousDay : nextDay);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (editing) void stopEditing();
      else void close();
    }
  };

  // Insère du texte à la place de la sélection d'une zone (ou au curseur).
  const insert = (zone: 'done' | 'next', text: string) => {
    const area = refs[zone].current;
    const value = latest.current[zone];
    const [start, end] = area ? [area.selectionStart, area.selectionEnd] : [value.length, value.length];
    const before = value.slice(0, start);
    const block = (before && !before.endsWith('\n') ? '\n' : '') + text + '\n';
    latest.current = { ...latest.current, [zone]: before + block + value.slice(end) };
    setValues(latest.current);
    const cursor = start + block.length;
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(cursor, cursor);
    });
  };
  // Tâches proposées, sans celles déjà dans la zone : faites depuis le bilan
  // d'avant (sans bilan d'avant : aucune), P1 à faire.
  const since = day ? (data?.reviews ?? []).filter((r) => r.day < day).at(-1)?.day : undefined;
  const recent =
    day && since
      ? (data?.done ?? []).filter((t) => t.done_at > since && t.done_at <= day && !values.done.includes(taskLink(t.id)))
      : [];
  const p1 = project.tasks.filter((t) => t.priority === 1 && !values.next.includes(taskLink(t.id)));

  // Lien vers une tâche (#tache-12) : ouvre sa fiche, après avoir enregistré.
  const onPreviewClick = async (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const taskId = link?.getAttribute('href')?.match(TASK_LINK)?.[1];
    if (!taskId) return;
    e.preventDefault();
    if (await persist()) onOpenTask(Number(taskId), saved.current.day);
  };

  const html = {
    notes: useMemo(() => renderMarkdown(values.notes), [values.notes]),
    done: useMemo(() => renderMarkdown(values.done), [values.done]),
    next: useMemo(() => renderMarkdown(values.next), [values.next]),
  };
  // Aperçu Markdown d'une zone en lecture ; double-clic : la modifier.
  const preview = (zone: 'notes' | 'done' | 'next', empty: string, className?: string) => (
    <div
      className={cn(
        `${zone}-preview markdown min-h-12 rounded-md border px-3 py-2 text-sm`,
        !values[zone].trim() && 'flex items-center justify-center text-muted-foreground',
        className,
      )}
      onClick={onPreviewClick}
      onDoubleClick={() => startEditing(zone)}
      {...(values[zone].trim() ? { dangerouslySetInnerHTML: { __html: html[zone] } } : { children: empty })}
    />
  );

  const ticketKey = values.ticket.trim().toUpperCase();
  const ticketLink = BUGTRACKER_KEY_RE.test(ticketKey) ? bugtrackerLink({ bugtracker_key: ticketKey }, settings) : null;
  const count = project.tasks.length;
  const state = [project.archived_at && 'archivé', `${count} tâche${count > 1 ? 's' : ''} à faire`]
    .filter(Boolean)
    .join(' · ');
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

  // En-tête des bilans (lecture et édition) : ← → en haut à gauche, date, nouveau
  // bilan ; reste visible en haut quand le corps défile.
  const reviewHeader = (
    <div className="review-header sticky top-0 z-10 -mx-1 flex min-h-9 items-center gap-1 bg-background px-1">
      {days.length > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            className="review-previous text-muted-foreground"
            aria-label="Bilan précédent"
            title="Bilan précédent (←)"
            disabled={!previousDay}
            onClick={() => void goTo(previousDay)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            className="review-next text-muted-foreground"
            aria-label="Bilan suivant"
            title="Bilan suivant (→)"
            disabled={!nextDay}
            onClick={() => void goTo(nextDay)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </>
      )}
      <h3 className="review-day ml-1 text-sm font-medium first-letter:uppercase">
        {day ? `Bilan du ${formatDay(day)}` : data ? 'Aucun bilan' : ''}
      </h3>
      {data && day !== today && !days.includes(today) && (
        <Button
          type="button"
          size="sm"
          tabIndex={-1}
          className="new-review ml-auto h-7 text-xs text-muted-foreground"
          title="Nouveau bilan, daté d’aujourd’hui (s)"
          onClick={() => void reviewToday()}
        >
          <Plus aria-hidden /> Nouveau bilan
        </Button>
      )}
    </div>
  );

  // Une zone du bilan en édition : libellé, bouton d'insertion (s'il y a quelque chose à insérer), champ.
  const zone = (name: 'done' | 'next', label: string, action: ReactNode) => (
    <div className="grid min-w-0 content-start gap-1.5">
      <div className="flex min-h-7 items-center gap-1.5">
        <Label htmlFor={`${id}-${name}`} className="mr-auto">
          {label}
        </Label>
        {action}
      </div>
      <Textarea
        ref={refs[name]}
        id={`${id}-${name}`}
        className="min-h-32 font-mono text-sm"
        value={values[name]}
        onChange={set(name)}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );

  // Repères : bouton qui les déplie (📌 plein : remplis, vide : rien d'écrit).
  const filledNotes = Boolean(values.notes.trim());
  const notesToggle = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="notes-toggle -ml-2 h-7 w-fit gap-1.5 px-2 text-sm font-medium"
      aria-expanded={showNotes}
      aria-controls={`${id}-notes-zone`}
      title={`${showNotes ? 'Replier' : 'Déplier'} les repères${filledNotes ? '' : ' (vides)'}`}
      onClick={toggleNotes}
    >
      <Pin
        aria-hidden
        className={cn('notes-filled', filledNotes ? 'text-foreground' : 'text-muted-foreground')}
        fill={filledNotes ? 'currentColor' : 'none'}
      />
      Repères
      {!filledNotes && <span className="sr-only"> (vides)</span>}
      <ChevronDown
        aria-hidden
        className={cn('text-muted-foreground transition-transform', showNotes && 'rotate-180')}
      />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className="project-dialog top-[5vh] flex max-h-[90vh] translate-y-0 flex-col gap-4 sm:max-w-3xl"
        onKeyDown={onKeyDown}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          void close();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // s : « Fait dernièrement », une fois les bilans lus.
          if (field === 'summary') focusSoon('done');
          else ({ notes: reader, edit: refs.name }[field].current as HTMLElement | null)?.focus();
        }}
        // À la fermeture, retour sur le projet dans la liste.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusByKey(`project:${project.id}`);
        }}
      >
        <DialogTitle className={cn('pr-6 leading-snug [overflow-wrap:anywhere]', editing && 'sr-only')}>
          {values.name}
        </DialogTitle>
        {editing && (
          <div className="grid gap-1.5 pr-6">
            <Input
              ref={refs.name}
              aria-label="Nom"
              autoComplete="off"
              className="h-auto rounded-none border-0 border-b bg-transparent px-0 py-0 text-lg leading-snug font-semibold shadow-none focus-visible:border-primary focus-visible:ring-0 md:text-lg dark:bg-transparent"
              value={values.name}
              onChange={set('name')}
              onKeyDown={onInputEnter}
              {...invalid('name')}
            />
            {errorFor('name')}
          </div>
        )}
        <DialogDescription>Projet · {state}</DialogDescription>

        {editing ? (
          <div className="-mx-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-1 pb-1">
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
              </div>
            </div>
            <div className="grid gap-1.5">
              {notesToggle}
              {showNotes && (
                <Textarea
                  ref={refs.notes}
                  id={`${id}-notes-zone`}
                  aria-label="Repères"
                  className="min-h-24 font-mono text-sm"
                  placeholder="Ce qu’est le projet, liens utiles… (affichés avec chaque bilan)"
                  value={values.notes}
                  onChange={set('notes')}
                  aria-describedby={`${id}-hint`}
                />
              )}
            </div>
            <div className="grid gap-1.5">
              {reviewHeader}
              {day && (
                <div className="grid gap-4">
                  {zone(
                    'done',
                    'Fait dernièrement',
                    recent.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="insert-done h-7 text-xs text-muted-foreground"
                        title="Ajouter les tâches faites depuis le bilan d’avant, en liens vers leur fiche"
                        onClick={() => insert('done', taskLines(recent))}
                      >
                        <ListChecks aria-hidden /> Ajouter les tâches précédentes ({recent.length})
                      </Button>
                    ),
                  )}
                  {zone(
                    'next',
                    'Prochainement',
                    p1.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="insert-p1 h-7 text-xs text-muted-foreground"
                        title="Ajouter les tâches à faire de priorité 1, en liens vers leur fiche"
                        onClick={() => insert('next', taskLines(p1))}
                      >
                        <PriorityIcon priority={null} /> Ajouter les prochaines tâches prioritaires ({p1.length})
                      </Button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            ref={reader}
            tabIndex={-1}
            className="reader -mx-1 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-1 pb-1 outline-none"
            aria-describedby={`${id}-hint`}
          >
            {/* Comme la fiche d'une tâche : libellés atténués, valeur absente aussi. */}
            <dl className="grid grid-cols-[7rem_1fr] gap-x-4 text-sm leading-7">
              <dt className="text-muted-foreground">Ticket</dt>
              <dd className={cn('ticket-value font-mono', !values.ticket && 'font-sans text-muted-foreground')}>
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
                  values.ticket || 'aucun'
                )}
              </dd>
            </dl>
            <section className="grid gap-1.5">
              {notesToggle}
              {showNotes && <div id={`${id}-notes-zone`}>{preview('notes', 'Aucun repère')}</div>}
            </section>
            <section className="grid gap-1.5" aria-label="Bilan">
              {reviewHeader}
              {day && (
                <div className="grid gap-4">
                  <div className="grid min-w-0 content-start gap-1.5">
                    <h4 className="text-sm text-muted-foreground">Fait dernièrement</h4>
                    {preview('done', 'Rien')}
                  </div>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <h4 className="text-sm text-muted-foreground">Prochainement</h4>
                    {preview('next', 'Rien')}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {editing
              ? 'Tab : champ suivant · Ctrl+Entrée : enregistrer et repasser en lecture'
              : 'e : modifier · s : bilan du jour · ← → : bilans · Ctrl+Entrée ou Échap : fermer'}
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
