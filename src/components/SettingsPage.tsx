import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Page d'administration (/admin) : réglages conservés en base.
export function SettingsPage({ onBack }: { onBack: () => void }) {
  const id = useId();
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [status, setStatus] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    api
      .settings()
      .then((s) => setJiraBaseUrl(s.jira_base_url ?? ''))
      .catch((err) => setStatus({ error: err.message }));
  }, []);

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
        <ArrowLeft className="size-4" aria-hidden /> Retour aux tâches
      </a>
      <h1 className="mt-4 text-2xl font-bold">Réglages</h1>

      <section aria-labelledby={`${id}-jira`} className="mt-6">
        <h2 id={`${id}-jira`} className="font-semibold">
          Jira
        </h2>
        <form className="mt-3 grid max-w-lg gap-2" onSubmit={save} noValidate>
          <Label htmlFor={`${id}-url`}>URL du Jira de l’entreprise</Label>
          <Input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://entreprise.atlassian.net"
            value={jiraBaseUrl}
            onChange={(e) => setJiraBaseUrl(e.target.value)}
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(status.error)}
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Une clé de ticket saisie sur une tâche (ex. PROJ-123) devient un lien vers {jiraBaseUrl.trim() || 'cette URL'}
            /browse/PROJ-123.
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
    </div>
  );
}
