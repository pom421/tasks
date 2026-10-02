// Accès à Jira Data Center / Server (API REST v2), authentifié par un PAT
// (Personal Access Token, en-tête Bearer). Le PAT ne quitte jamais le serveur.
// Champs synchronisés : titre ↔ summary, contenu ↔ description (texte tel
// quel, sans conversion Markdown ↔ wiki Jira), échéance ↔ duedate.
import type { JiraFields } from '../shared/types.ts';

export interface JiraConfig {
  baseUrl: string; // ex. https://jira.entreprise.fr (sans / final)
  pat: string;
}

// Erreur à montrer telle quelle à l'utilisateur.
export class JiraError extends Error {}

async function call(config: JiraConfig, method: 'GET' | 'PUT', key: string, body?: unknown): Promise<Response> {
  const url = `${config.baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}${method === 'GET' ? '?fields=summary,description,duedate' : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.pat}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new JiraError(`Jira injoignable (${config.baseUrl})`);
  }
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new JiraError('PAT refusé par Jira (vérifier les Réglages)');
  if (res.status === 404) throw new JiraError(`Ticket ${key} introuvable dans Jira`);
  // Erreurs de validation de Jira : { errorMessages: [...], errors: { champ: message } }.
  const data = (await res.json().catch(() => ({}))) as { errorMessages?: string[]; errors?: Record<string, string> };
  const details = [...(data.errorMessages ?? []), ...Object.entries(data.errors ?? {}).map(([f, m]) => `${f} : ${m}`)];
  throw new JiraError(`Jira a répondu ${res.status}${details.length ? ` : ${details.join(' ; ')}` : ''}`);
}

export async function readIssue(config: JiraConfig, key: string): Promise<JiraFields> {
  const data = (await (await call(config, 'GET', key)).json()) as { fields?: Record<string, unknown> };
  const f = data.fields ?? {};
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');
  return {
    title: text(f.summary),
    notes: text(f.description) || null,
    due_at: typeof f.duedate === 'string' ? f.duedate.slice(0, 10) : null,
  };
}

export async function writeIssue(config: JiraConfig, key: string, fields: JiraFields): Promise<void> {
  await call(config, 'PUT', key, {
    fields: { summary: fields.title, description: fields.notes ?? '', duedate: fields.due_at },
  });
}
