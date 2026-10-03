// Accès à Jira Data Center / Server (API REST v2), authentifié par un PAT
// (Personal Access Token, en-tête Bearer). Le PAT ne quitte jamais le serveur.
// Champs synchronisés : titre ↔ summary, contenu ↔ description (texte tel
// quel, sans conversion Markdown ↔ wiki Jira), échéance ↔ duedate, sprint ↔
// champ Sprint (Jira Software : champ personnalisé, cherché par son type).
import type { JiraFields } from '../shared/types.ts';

export interface JiraConfig {
  baseUrl: string; // ex. https://jira.entreprise.fr (sans / final)
  pat: string;
}

// Erreur à montrer telle quelle à l'utilisateur.
export class JiraError extends Error {}

const SPRINT_TYPE = 'com.pyxis.greenhopper.jira:gh-sprint';

async function call(config: JiraConfig, method: 'GET' | 'PUT', path: string, body?: unknown, key?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
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
  if (res.status === 404 && key) throw new JiraError(`Ticket ${key} introuvable dans Jira`);
  // Erreurs de validation de Jira : { errorMessages: [...], errors: { champ: message } }.
  const data = (await res.json().catch(() => ({}))) as { errorMessages?: string[]; errors?: Record<string, string> };
  const details = [...(data.errorMessages ?? []), ...Object.entries(data.errors ?? {}).map(([f, m]) => `${f} : ${m}`)];
  throw new JiraError(`Jira a répondu ${res.status}${details.length ? ` : ${details.join(' ; ')}` : ''}`);
}

const get = async <T>(config: JiraConfig, path: string, key?: string) => (await (await call(config, 'GET', path, undefined, key)).json()) as T;

// Identifiant du champ Sprint (customfield_…), null sans Jira Software.
async function sprintField(config: JiraConfig): Promise<string | null> {
  const fields = await get<{ id: string; schema?: { custom?: string } }[]>(config, '/rest/api/2/field');
  return fields.find((f) => f.schema?.custom === SPRINT_TYPE)?.id ?? null;
}

interface Sprint {
  id: number;
  name: string;
  active: boolean;
}

// Valeur du champ Sprint : objets { id, name, state } (versions récentes) ou
// chaînes « …Sprint@1a2b[id=12,state=ACTIVE,name=Sprint 5,startDate=…] ».
function parseSprints(value: unknown): Sprint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): Sprint[] => {
    if (typeof v === 'string') {
      const id = Number(v.match(/[[,]id=(\d+)/)?.[1]);
      const name = v.match(/[[,]name=(.*?)(?:,\w+=|\]$)/)?.[1];
      return name ? [{ id, name, active: /[[,]state=ACTIVE\b/i.test(v) }] : [];
    }
    const s = v as { id?: number; name?: string; state?: string };
    return s?.name ? [{ id: Number(s.id), name: s.name, active: s.state?.toUpperCase() === 'ACTIVE' }] : [];
  });
}

// Sprint de la tâche : l'actif, sinon le dernier.
const currentSprint = (sprints: Sprint[]) => sprints.find((s) => s.active) ?? sprints.at(-1) ?? null;

async function readRaw(config: JiraConfig, key: string) {
  const field = await sprintField(config);
  const data = await get<{ fields?: Record<string, unknown> }>(
    config,
    `/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,description,duedate${field ? `,${field}` : ''}`,
    key,
  );
  const f = data.fields ?? {};
  return { field, f, sprint: field ? currentSprint(parseSprints(f[field])) : null };
}

export async function readIssue(config: JiraConfig, key: string): Promise<JiraFields> {
  const { f, sprint } = await readRaw(config, key);
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');
  return {
    title: text(f.summary),
    notes: text(f.description) || null,
    due_at: typeof f.duedate === 'string' ? f.duedate.slice(0, 10) : null,
    sprint: sprint?.name ?? null,
  };
}

// Sprints actifs puis à venir des tableaux Scrum d'un projet (PROJ), sans
// doublon (un sprint peut être sur plusieurs tableaux). Jira n'a pas d'appel
// « sprints d'un projet » : on passe par ses tableaux.
export async function listSprints(config: JiraConfig, project: string): Promise<{ id: number; name: string }[]> {
  const boards = await get<{ values: { id: number }[] }>(config, `/rest/agile/1.0/board?type=scrum&projectKeyOrId=${encodeURIComponent(project)}`);
  const found = new Map<number, { id: number; name: string; active: boolean }>();
  for (const board of boards.values) {
    const sprints = await get<{ values: { id: number; name: string; state: string }[] }>(
      config,
      `/rest/agile/1.0/board/${board.id}/sprint?state=active,future&maxResults=100`,
    );
    for (const s of sprints.values) found.set(s.id, { id: s.id, name: s.name, active: s.state.toLowerCase() === 'active' });
  }
  return [...found.values()].sort((a, b) => Number(b.active) - Number(a.active)).map(({ id, name }) => ({ id, name }));
}

// Sprint actif ou à venir du projet du ticket, par son nom.
async function findSprint(config: JiraConfig, key: string, name: string): Promise<number> {
  const project = key.split('-')[0];
  const found = (await listSprints(config, project)).find((s) => s.name === name);
  if (found) return found.id;
  throw new JiraError(`Sprint « ${name} » introuvable dans Jira (actif ou à venir, projet ${project})`);
}

export async function writeIssue(config: JiraConfig, key: string, fields: JiraFields): Promise<void> {
  const body: Record<string, unknown> = { summary: fields.title, description: fields.notes ?? '', duedate: fields.due_at };
  // Sprint écrit seulement s'il change (Jira le refuse sur un sprint fermé).
  const { field, sprint } = await readRaw(config, key);
  if ((sprint?.name ?? null) !== fields.sprint) {
    if (!field) throw new JiraError('Pas de champ Sprint dans Jira');
    body[field] = fields.sprint ? await findSprint(config, key, fields.sprint) : null;
  }
  await call(config, 'PUT', `/rest/api/2/issue/${encodeURIComponent(key)}`, { fields: body }, key);
}
