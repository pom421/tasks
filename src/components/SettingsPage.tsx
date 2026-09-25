import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Page d'administration (/admin) : réglages conservés en base.
export function SettingsPage({ onBack }: { onBack: () => void }) {
  const id = useId();
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  // Import .sqlite en deux temps (il remplace toute la base) : 1er clic = message,
  // 2e clic = choix du fichier. Pas de fenêtre de confirmation.
  const [confirmImport, setConfirmImport] = useState(false);

  // Échap : annule l'import demandé, sinon retour à la page principale (où que soit le focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (confirmImport) setConfirmImport(false);
      else onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack, confirmImport]);

  useEffect(() => {
    api
      .settings()
      // Saisie déjà commencée pendant le chargement : on ne l'écrase pas.
      .then((s) => setJiraBaseUrl((v) => v || (s.jira_base_url ?? '')))
      .catch((err) => setStatus({ error: err.message }));
  }, []);

  // Export / import de la base.
  const dbInput = useRef<HTMLInputElement>(null);
  const mdInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<{ ok?: string; error?: string }>({});
  const run = async (fn: () => Promise<string>) => {
    setData({});
    try {
      setData({ ok: await fn() });
    } catch (err) {
      setData({ error: (err as Error).message });
    }
  };
  const importDb = (file: File) =>
    run(async () => {
      await api.importDb(file);
      return 'Base importée.';
    });
  const importMd = (file: File) =>
    run(async () => {
      const r = await api.importMarkdown(await file.text());
      return `Import : ${r.projects} projet(s) créé(s), ${r.tasks} tâche(s).`;
    });
  // Relâche le fichier choisi pour pouvoir réimporter le même.
  const pick = (handler: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handler(file);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus({});
    try {
      const saved = await api.updateSettings({ jira_base_url: jiraBaseUrl.trim() || null });
      setJiraBaseUrl(saved.jira_base_url ?? '');
      setStatus({ ok: 'Réglages enregistrés.' });
    } catch (err) {
      setStatus({ error: (err as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        <ArrowLeft className="size-4" aria-hidden /> Retour aux tâches (Échap)
      </a>
      <h1 className="mt-4 text-2xl font-bold">Réglages</h1>

      <section aria-labelledby={`${id}-jira`} className="mt-6">
        <h2 id={`${id}-jira`} className="font-semibold">
          Tickets
        </h2>
        <form className="mt-3 grid max-w-lg gap-2" onSubmit={save} noValidate>
          <Label htmlFor={`${id}-url`}>URL de base des tickets</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://entreprise.atlassian.net"
            value={jiraBaseUrl}
            onChange={(e) => setJiraBaseUrl(e.target.value)}
            className="h-8"
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(status.error)}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Ex. https://entreprise.atlassian.net. Un identifiant saisi sur une tâche (PROJ-123) devient un lien vers{' '}
            {jiraBaseUrl.trim() || 'cette URL'}/browse/PROJ-123.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Button type="submit">
              Enregistrer
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {status.ok}
            </p>
          </div>
          {status.error && (
            <p role="alert" className="text-sm text-destructive">
              {status.error}
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby={`${id}-data`} className="mt-10">
        <h2 id={`${id}-data`} className="font-semibold">
          Données
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Exporter télécharge la base (.sqlite). Importer .sqlite la remplace entièrement ; importer .md ajoute des projets et des tâches.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button asChild>
            <a href="/api/export">Exporter</a>
          </Button>
          <Button
            className={cn(confirmImport && 'text-destructive')}
            title="Remplace toute la base (clic, puis clic à nouveau)"
            onClick={() => {
              setConfirmImport(!confirmImport);
              if (confirmImport) dbInput.current?.click();
            }}
            onBlur={() => setConfirmImport(false)}
          >
            Importer .sqlite
          </Button>
          <Button onClick={() => mdInput.current?.click()}>
            Importer .md
          </Button>
          <input ref={dbInput} type="file" accept=".sqlite,.db,.sqlite3" hidden onChange={pick(importDb)} />
          <input ref={mdInput} type="file" accept=".md,.markdown,.txt" hidden onChange={pick(importMd)} />
        </div>
        {confirmImport && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Importer .sqlite à nouveau : choisir le fichier qui remplacera toute la base (pensez à exporter avant) · Échap : annuler
          </p>
        )}
        <p id="data-status" role="status" className="mt-2 text-sm text-muted-foreground">
          {data.ok}
        </p>
        {data.error && (
          <p role="alert" className="text-sm text-destructive">
            {data.error}
          </p>
        )}
      </section>
    </div>
  );
}
