import { useRef, type ChangeEvent } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useActions } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['↑ ↓  j k', 'Se déplacer (Début / Fin : premier / dernier)'],
  ['Maj+Entrée  o', 'Ouvrir la fiche ; e : tout modifier (Tab : champ suivant), Ctrl+Entrée : lecture'],
  ['Entrée', 'Modifier le nom sélectionné / valider'],
  ['Échap', "Quitter l'édition, retour à la navigation"],
  ['Espace', 'Cocher / décocher la tâche'],
  ['Alt+↑ Alt+↓', 'Monter / descendre la tâche, jusque dans le projet voisin (Alt+k / Alt+j)'],
  ['J', 'Report : à reporter → reporté → rien (majuscule)'],
  ['L', 'Ouvrir la fiche sur l’identifiant du ticket (majuscule)'],
  ['r', 'Afficher seulement les tâches à reporter'],
  ['x x', 'Supprimer la tâche (x une 2e fois pour confirmer)'],
  ['p', 'Nouveau projet'],
  ['n', 'Nouvelle tâche (dernier projet utilisé)'],
  ['d', 'Filtrer le journal par période (début, puis fin)'],
  ['f', 'Filtrer le journal par projet'],
  ['?', 'Cette aide'],
];

interface ToolbarProps {
  jiraPending: number;
  jiraFilter: boolean;
  onJiraFilter: () => void;
  showArchived: boolean;
  onShowArchived: (value: boolean) => void;
  helpOpen: boolean;
  onHelpOpen: (open: boolean) => void;
}

export function Toolbar({ jiraPending, jiraFilter, onJiraFilter, showArchived, onShowArchived, helpOpen, onHelpOpen }: ToolbarProps) {
  const { act, toast, navigate } = useActions();
  const dbInput = useRef<HTMLInputElement>(null);
  const mdInput = useRef<HTMLInputElement>(null);

  const importDb = (file: File) => {
    if (!confirm('Remplacer TOUTE la base actuelle par ce fichier ?\nPensez à exporter avant.')) return;
    act(async () => {
      await api.importDb(file);
      toast('Base importée');
    });
  };

  const importMd = (file: File) =>
    act(async () => {
      const r = await api.importMarkdown(await file.text());
      toast(`Import : ${r.projects} projet(s) créé(s), ${r.tasks} tâche(s)`);
    });

  // Relâche le fichier choisi pour pouvoir réimporter le même.
  const pick = (handler: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handler(file);
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 pt-6 pb-2">
      <h1 className="text-2xl font-bold">Tâches</h1>
      <nav className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <Checkbox id="show-archived" checked={showArchived} onCheckedChange={(v) => onShowArchived(v === true)} /> Archivés
        </label>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/export">Exporter</a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => dbInput.current?.click()}>
          Importer .sqlite
        </Button>
        <Button variant="outline" size="sm" onClick={() => mdInput.current?.click()}>
          Importer .md
        </Button>
        <Button variant="outline" size="sm" title="Raccourcis (?)" onClick={() => onHelpOpen(true)}>
          ?
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a
            href="/admin"
            id="settings-link"
            title="Réglages"
            aria-label="Réglages"
            onClick={(e) => {
              e.preventDefault();
              navigate('/admin');
            }}
          >
            <SettingsIcon aria-hidden />
          </a>
        </Button>
        <input ref={dbInput} type="file" accept=".sqlite,.db,.sqlite3" hidden onChange={pick(importDb)} />
        <input ref={mdInput} type="file" accept=".md,.markdown,.txt" hidden onChange={pick(importMd)} />
      </nav>

      {/* Ligne réservée (hauteur fixe) : le bouton apparaît sans rien décaler. */}
      <div className="flex h-8 w-full justify-end">
        {(jiraPending > 0 || jiraFilter) && (
          <Button
            id="jira-pending"
            variant={jiraFilter ? 'default' : 'outline'}
            size="sm"
            aria-pressed={jiraFilter}
            title="Afficher seulement les tâches à reporter (r)"
            onClick={onJiraFilter}
          >
            {jiraPending} {jiraPending > 1 ? 'tâches' : 'tâche'} à reporter
          </Button>
        )}
      </div>

      <Dialog open={helpOpen} onOpenChange={onHelpOpen}>
        <DialogContent>
          <DialogTitle>Raccourcis</DialogTitle>
          <DialogDescription>À la souris : clic sur un nom pour le modifier.</DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="rounded border px-1 font-mono text-xs">{key}</kbd>
                </dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </header>
  );
}
