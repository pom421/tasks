import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import type { About } from '../../shared/types.ts';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Logo GitHub (Octicons « mark-github », MIT) : Lucide n'a plus d'icônes de marque.
function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

// Page d'administration (/admin) : réglages conservés en base.
export function SettingsPage({ onBack }: { onBack: () => void }) {
  const id = useId();
  const [bugtrackerBaseUrl, setBugtrackerBaseUrl] = useState('');
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});
  // PAT Jira : saisi masqué, jamais relu (on sait seulement s'il est enregistré).
  const [pat, setPat] = useState('');
  const [patSet, setPatSet] = useState(false);
  // Aujourd’hui : maximum de tâches par jour (texte saisi, vérifié par le serveur).
  const [capacity, setCapacity] = useState('');
  const [dayStatus, setDayStatus] = useState<{ ok?: string; error?: string }>({});
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
      .then((s) => {
        setBugtrackerBaseUrl((v) => v || (s.bugtracker_base_url ?? ''));
        setCapacity((v) => v || String(s.day_capacity));
        setPatSet(s.jira_pat_set);
      })
      .catch((err) => setStatus({ error: err.message }));
  }, []);

  // À propos : versions de l'outil et de la base, repliées par défaut.
  const [about, setAbout] = useState<About | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  useEffect(() => {
    api.about().then(setAbout, () => {});
  }, []);
  const day = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  // Dernière migration : heure UTC de la base, affichée en heure locale.
  const migratedAt = (utc: string) =>
    new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

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
      // PAT vide : celui enregistré est gardé.
      const saved = await api.updateSettings({
        bugtracker_base_url: bugtrackerBaseUrl.trim() || null,
        ...(pat.trim() && { jira_pat: pat.trim() }),
      });
      setBugtrackerBaseUrl(saved.bugtracker_base_url ?? '');
      setPat('');
      setPatSet(saved.jira_pat_set);
      setStatus({ ok: 'Réglages enregistrés.' });
    } catch (err) {
      setStatus({ error: (err as Error).message });
    }
  };

  const removePat = async () => {
    setStatus({});
    try {
      setPatSet((await api.updateSettings({ jira_pat: null })).jira_pat_set);
      setStatus({ ok: 'PAT retiré.' });
    } catch (err) {
      setStatus({ error: (err as Error).message });
    }
  };

  const saveCapacity = async (e: FormEvent) => {
    e.preventDefault();
    setDayStatus({});
    try {
      const saved = await api.updateSettings({ day_capacity: Number(capacity) });
      setCapacity(String(saved.day_capacity));
      setDayStatus({ ok: 'Réglages enregistrés.' });
    } catch (err) {
      setDayStatus({ error: (err as Error).message });
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

      <section aria-labelledby={`${id}-bugtracker`} className="mt-6">
        <h2 id={`${id}-bugtracker`} className="font-semibold">
          Tickets
        </h2>
        <form className="mt-3 grid max-w-lg gap-2" onSubmit={save} noValidate>
          <Label htmlFor={`${id}-url`}>URL de base des tickets</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://entreprise.tickets.fr"
            value={bugtrackerBaseUrl}
            onChange={(e) => setBugtrackerBaseUrl(e.target.value)}
            className="h-8"
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(status.error)}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Ex. https://entreprise.tickets.fr. Un identifiant saisi sur une tâche (PROJ-123) devient un lien vers{' '}
            {bugtrackerBaseUrl.trim() || 'cette URL'}/browse/PROJ-123.
          </p>
          <Label htmlFor={`${id}-pat`} className="mt-3">
            PAT Jira (jeton d’accès personnel)
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`${id}-pat`}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={patSet ? 'Enregistré (laisser vide pour le garder)' : 'Aucun'}
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              className="h-8"
              aria-describedby={`${id}-pat-hint`}
            />
            {patSet && (
              <Button type="button" onClick={removePat}>
                Retirer
              </Button>
            )}
          </div>
          <p id={`${id}-pat-hint`} className="text-xs text-muted-foreground">
            Jira Data Center : profil → Jetons d’accès personnels. Sert à pousser une tâche vers son ticket et à la
            récupérer depuis Jira (fiche, &gt; et &lt;). Gardé sur ce poste, jamais réaffiché ni exporté.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Button type="submit">Enregistrer</Button>
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

      <section aria-labelledby={`${id}-day`} className="mt-10">
        <h2 id={`${id}-day`} className="font-semibold">
          Aujourd’hui
        </h2>
        <form className="mt-3 grid max-w-lg gap-2" onSubmit={saveCapacity} noValidate>
          <Label htmlFor={`${id}-capacity`}>Nombre de tâches maximum par jour</Label>
          <Input
            id={`${id}-capacity`}
            type="number"
            min={1}
            max={50}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="h-8 w-24"
            aria-invalid={Boolean(dayStatus.error)}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button type="submit">Enregistrer</Button>
            <p role="status" className="text-sm text-muted-foreground">
              {dayStatus.ok}
            </p>
          </div>
          {dayStatus.error && (
            <p role="alert" className="text-sm text-destructive">
              {dayStatus.error}
            </p>
          )}
        </form>
      </section>

      <section aria-labelledby={`${id}-data`} className="mt-10">
        <h2 id={`${id}-data`} className="font-semibold">
          Données
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Exporter télécharge la base (.sqlite). Importer .sqlite la remplace entièrement ; importer .md ajoute des
          projets et des tâches.
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
          <Button onClick={() => mdInput.current?.click()}>Importer .md</Button>
          <input ref={dbInput} type="file" accept=".sqlite,.db,.sqlite3" hidden onChange={pick(importDb)} />
          <input ref={mdInput} type="file" accept=".md,.markdown,.txt" hidden onChange={pick(importMd)} />
        </div>
        {confirmImport && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Importer .sqlite à nouveau : choisir le fichier qui remplacera toute la base (pensez à exporter avant) ·
            Échap : annuler
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

      <section className="mt-10 mb-6">
        <h2>
          <Button
            variant="ghost"
            className="about-toggle -ml-2 h-8 gap-1.5 px-2 text-base font-semibold"
            aria-expanded={showAbout}
            aria-controls={`${id}-about`}
            title={showAbout ? 'Masquer les versions' : 'Afficher la version de l’outil et celle de la base'}
            onClick={() => setShowAbout(!showAbout)}
          >
            À propos
            <ChevronDown
              aria-hidden
              className={cn('text-muted-foreground transition-transform', showAbout && 'rotate-180')}
            />
          </Button>
        </h2>
        {showAbout && (
          <dl id={`${id}-about`} className="about mt-2 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
            {about ? (
              <>
                <dt className="text-muted-foreground">Outil</dt>
                <dd className="about-app">
                  version {about.app_version}
                  {about.commit && (
                    <span className="text-muted-foreground">
                      {' '}
                      · commit <span className="font-mono">{about.commit.hash}</span> du {day(about.commit.date)}
                    </span>
                  )}
                  {/* Dépôt sur GitHub, dans un nouvel onglet : icône seule, comme celles d'une tâche. */}
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-xs"
                    className="about-repo -my-1 ml-1.5 align-middle text-muted-foreground"
                  >
                    <a
                      href={about.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Dépôt GitHub"
                      title="Ouvrir le dépôt sur GitHub"
                    >
                      <GitHubIcon />
                    </a>
                  </Button>
                </dd>
                <dt className="text-muted-foreground">Base</dt>
                <dd
                  className={cn('about-schema', about.schema_version !== about.schema_expected && 'text-destructive')}
                >
                  version {about.schema_version}
                  <span className="text-muted-foreground"> · attendue par l’outil : {about.schema_expected}</span>
                </dd>
                <dt className="text-muted-foreground">Dernière migration</dt>
                <dd className="about-migrated">
                  {about.migrated_at ? migratedAt(about.migrated_at) : 'avant le suivi des migrations'}
                </dd>
                <dt className="text-muted-foreground">Fichier</dt>
                <dd className="about-file font-mono text-xs leading-5 [overflow-wrap:anywhere]">{about.db_file}</dd>
              </>
            ) : (
              <dd className="col-span-2 text-muted-foreground">Informations indisponibles</dd>
            )}
          </dl>
        )}
      </section>
    </div>
  );
}
