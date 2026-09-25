import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { type DeletedProject, type ProjectPatch, type ProjectRow, type Store, type TaskPatch, type TaskRow, isDate, today } from './db.ts';
import { JIRA_KEY_RE, type JiraState, type Settings } from '../shared/types.ts';
import { parseMarkdown } from './markdown.ts';

type Req = IncomingMessage;
type Res = ServerResponse;
type Handler = (req: Req, res: Res, url: URL, ...params: string[]) => void | Promise<void>;
type Body = Record<string, unknown>;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const MAX_BODY = 50 * 1024 * 1024;

// En-têtes de sécurité sur toutes les réponses. Aucun script inline ni
// ressource externe : 'self' partout. Seule exception, les styles inline :
// les dialogues Radix (shadcn) injectent une balise <style> pour bloquer le
// défilement. Les scripts, eux, restent strictement limités à 'self'.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

// Noms d'hôte acceptés dans l'en-tête Host : bloque le DNS rebinding
// (un site malveillant dont le domaine pointe vers 127.0.0.1).
const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readBody(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Fichier trop volumineux'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Exiger un Content-Type « non simple » force le navigateur à faire un
// preflight CORS pour toute requête venue d'un autre site : elle échoue.
function requireType(req: Req, type: string) {
  const actual = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (actual !== type) throw new HttpError(415, `Content-Type attendu : ${type}`);
}

async function readJson(req: Req): Promise<Body> {
  requireType(req, 'application/json');
  const buf = await readBody(req);
  let body: unknown;
  try {
    body = buf.length ? JSON.parse(buf.toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Objet JSON attendu');
  return body as Body;
}

// Liens : http(s) uniquement. Un lien « javascript: » placé dans un href
// exécuterait du code au clic (XSS).
function httpUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  const url = typeof value === 'string' && value.length <= 2000 ? URL.parse(value.trim()) : null;
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new HttpError(400, 'Lien invalide : adresse http(s) attendue');
  }
  return url.href;
}

// Ticket Jira saisi : clé (PROJ-123) ou lien complet ; vide = aucun ticket.
function jiraTicket(value: unknown): { jiraKey: string | null; jiraUrl: string | null } {
  if (value === null || value === '') return { jiraKey: null, jiraUrl: null };
  const text = typeof value === 'string' ? value.trim() : '';
  if (JIRA_KEY_RE.test(text.toUpperCase())) return { jiraKey: text.toUpperCase(), jiraUrl: null };
  if (/^https?:/i.test(text)) return { jiraKey: null, jiraUrl: httpUrl(text) };
  throw new HttpError(400, 'Ticket invalide : identifiant attendu, ex. PROJ-123');
}

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

function int(v: unknown, label: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw new HttpError(400, `${label} invalide`);
  return v as number;
}

function timestamp(v: unknown, label: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !TIMESTAMP_RE.test(v)) throw new HttpError(400, `${label} invalide`);
  return v;
}

// Tâche à restaurer : chaque colonne est revérifiée (le corps vient du client).
function restoredTask(body: Body): TaskRow {
  const doneAt = body.done_at ?? null;
  if (doneAt !== null && !isDate(doneAt)) throw new HttpError(400, 'Date invalide');
  const key = body.jira_key ?? null;
  if (key !== null && (typeof key !== 'string' || !JIRA_KEY_RE.test(key))) throw new HttpError(400, 'Ticket invalide');
  return {
    id: int(body.id, 'Identifiant'),
    project_id: int(body.project_id, 'Projet'),
    title: requireText(body.title, 'Titre'),
    created_at: timestamp(body.created_at, 'Date de création') ?? today(),
    done_at: doneAt as string | null,
    position: int(body.position ?? 0, 'Position'),
    notes: optionalText(body.notes, 'Notes', 20_000),
    jira_wanted_at: timestamp(body.jira_wanted_at, 'Date de report'),
    jira_at: timestamp(body.jira_at, 'Date de report'),
    jira_key: key as string | null,
    jira_url: httpUrl(body.jira_url ?? null),
  };
}

// Projet à restaurer, avec ses tâches : tout est revérifié.
function restoredProject(body: Body): DeletedProject {
  const p = (body.project ?? {}) as Body;
  if (!Array.isArray(body.tasks) || body.tasks.length > 100_000) throw new HttpError(400, 'Tâches invalides');
  const project: ProjectRow = {
    id: int(p.id, 'Identifiant'),
    name: requireText(p.name, 'Nom'),
    created_at: timestamp(p.created_at, 'Date de création') ?? today(),
    archived_at: timestamp(p.archived_at, "Date d'archivage"),
    favorite_at: timestamp(p.favorite_at, 'Date de favori'),
    position: int(p.position ?? 0, 'Position'),
  };
  const tasks = body.tasks.map((t) => restoredTask((t ?? {}) as Body));
  if (tasks.some((t) => t.project_id !== project.id)) throw new HttpError(400, 'Tâche d’un autre projet');
  return { project, tasks };
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${label} invalide`);
  return value.trim() || null;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} requis`);
  return value.trim();
}

function tmpFile(ext: string): string {
  return path.join(os.tmpdir(), `tasks-${crypto.randomUUID()}${ext}`);
}

function send(res: Res, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Anti-CSRF : toute requête qui modifie des données doit venir de la page elle-même.
function checkOrigin(req: Req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
    throw new HttpError(403, 'Requête inter-sites refusée');
  }
  const origin = req.headers.origin;
  if (origin && URL.parse(origin)?.host !== req.headers.host) {
    throw new HttpError(403, 'Origine refusée');
  }
}

function checkHost(req: Req, allowedHosts: string[]) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!allowedHosts.includes(host)) throw new HttpError(421, 'Hôte non autorisé');
}

// Fichiers du front compilé (dist/). Toute URL inconnue renvoie index.html (SPA).
function serveStatic(req: Req, res: Res, dir: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Méthode non autorisée' });
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    return send(res, 400, { error: 'URL invalide' });
  }
  let file = path.join(dir, urlPath);
  if (!file.startsWith(dir + path.sep)) return send(res, 403, { error: 'Interdit' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Introuvable (lancer « pnpm build » ?)' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}

export interface AppOptions {
  allowedHosts?: string[];
  // Dossier du front compilé ; absent = API seule (en dev, Vite sert le front).
  staticDir?: string;
}

export function createApp(store: Store, { allowedHosts = DEFAULT_ALLOWED_HOSTS, staticDir }: AppOptions = {}) {
  // Table de routage : [méthode, regex, handler(req, res, url, ...params)].
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/state$/, (_req, res) => send(res, 200, store.state())],

    ['GET', /^\/api\/journal$/, (_req, res, url) => {
      const from = url.searchParams.get('from') || undefined;
      const to = url.searchParams.get('to') || undefined;
      const projectId = Number(url.searchParams.get('project')) || undefined;
      const jiraPending = url.searchParams.get('jira') === 'pending';
      const q = url.searchParams.get('q')?.trim().slice(0, 200) || undefined;
      if ((from && !isDate(from)) || (to && !isDate(to))) throw new HttpError(400, 'Date invalide');
      if (from && to && from > to) throw new HttpError(400, 'La date de début est après la date de fin');
      send(res, 200, store.journal({ from, to, projectId, jiraPending, q }));
    }],

    ['GET', /^\/api\/settings$/, (_req, res) => send(res, 200, store.settings())],

    ['PUT', /^\/api\/settings$/, async (req, res) => {
      const body = await readJson(req);
      const patch: Partial<Settings> = {};
      // URL Jira d'entreprise, sans « / » final (on y ajoute /browse/CLÉ).
      if ('jira_base_url' in body) patch.jira_base_url = httpUrl(body.jira_base_url)?.replace(/\/+$/, '') ?? null;
      send(res, 200, store.updateSettings(patch));
    }],

    ['POST', /^\/api\/projects$/, async (req, res) => {
      const { name } = await readJson(req);
      send(res, 201, store.createProject(requireText(name, 'Nom')));
    }],

    ['PATCH', /^\/api\/projects\/(\d+)$/, async (req, res, _url, id) => {
      const body = await readJson(req);
      const patch: ProjectPatch = {};
      if ('name' in body) patch.name = requireText(body.name, 'Nom');
      if ('archived' in body) patch.archived = Boolean(body.archived);
      if ('favorite' in body) patch.favorite = Boolean(body.favorite);
      const project = store.updateProject(Number(id), patch);
      if (!project) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, project);
    }],

    // Déplacement d'un projet : { index } parmi tous les projets.
    ['POST', /^\/api\/projects\/(\d+)\/move$/, async (req, res, _url, id) => {
      const index = Number((await readJson(req)).index);
      if (!Number.isInteger(index) || index < 0) throw new HttpError(400, 'Index invalide');
      if (!store.moveProject(Number(id), index)) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, { ok: true });
    }],

    // Renvoie le projet supprimé et ses tâches : le front les garde pour pouvoir annuler (u).
    ['DELETE', /^\/api\/projects\/(\d+)$/, (_req, res, _url, id) => {
      const deleted = store.deleteProject(Number(id));
      if (!deleted) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, deleted);
    }],

    // Annulation d'une suppression de projet : réinsertion telle quelle.
    ['POST', /^\/api\/projects\/restore$/, async (req, res) => {
      const deleted = restoredProject(await readJson(req));
      if (store.hasProject(deleted.project.id)) throw new HttpError(409, 'Projet déjà présent');
      if (deleted.tasks.some((t) => store.hasTask(t.id))) throw new HttpError(409, 'Tâche déjà présente');
      send(res, 201, store.restoreProject(deleted));
    }],

    ['POST', /^\/api\/tasks$/, async (req, res) => {
      const { project_id: projectId, title } = await readJson(req);
      const text = requireText(title, 'Titre');
      try {
        send(res, 201, store.createTask(Number(projectId), text));
      } catch {
        throw new HttpError(400, 'Projet introuvable');
      }
    }],

    ['PATCH', /^\/api\/tasks\/(\d+)$/, async (req, res, _url, id) => {
      const body = await readJson(req);
      const patch: TaskPatch = {};
      if ('title' in body) patch.title = requireText(body.title, 'Titre');
      // done: true -> faite (à done_at ou aujourd'hui), false -> à faire.
      const doneAt = body.done_at ?? (body.done ? today() : null);
      if (('done' in body || 'done_at' in body) && doneAt !== null && !isDate(doneAt)) {
        throw new HttpError(400, 'Date invalide');
      }
      if ('done' in body) patch.doneAt = body.done ? (doneAt as string) : null;
      else if ('done_at' in body) patch.doneAt = doneAt as string | null;
      if ('jira' in body) {
        if (!['none', 'wanted', 'done'].includes(body.jira as string)) throw new HttpError(400, 'État de report invalide');
        patch.jira = body.jira as JiraState;
      }
      if ('jira_ticket' in body) {
        Object.assign(patch, jiraTicket(body.jira_ticket));
        // Un ticket renseigné vaut « reportée ».
        if ((patch.jiraKey || patch.jiraUrl) && !('jira' in body)) patch.jira = 'done';
      }
      if ('notes' in body) patch.notes = optionalText(body.notes, 'Notes', 20_000);
      const task = store.updateTask(Number(id), patch);
      if (!task) throw new HttpError(404, 'Tâche introuvable');
      send(res, 200, task);
    }],

    // Déplacement (priorité) : { project_id, index } parmi les tâches à faire.
    ['POST', /^\/api\/tasks\/(\d+)\/move$/, async (req, res, _url, id) => {
      const body = await readJson(req);
      const projectId = Number(body.project_id);
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0) throw new HttpError(400, 'Index invalide');
      if (!store.hasProject(projectId)) throw new HttpError(400, 'Projet introuvable');
      if (!store.moveTask(Number(id), projectId, index)) throw new HttpError(404, 'Tâche à faire introuvable');
      send(res, 200, { ok: true });
    }],

    // Renvoie la tâche supprimée : le front la garde pour pouvoir annuler (u).
    ['DELETE', /^\/api\/tasks\/(\d+)$/, (_req, res, _url, id) => {
      const row = store.deleteTask(Number(id));
      if (!row) throw new HttpError(404, 'Tâche introuvable');
      send(res, 200, row);
    }],

    // Annulation d'une suppression : la tâche renvoyée par DELETE, réinsérée telle quelle.
    ['POST', /^\/api\/tasks\/restore$/, async (req, res) => {
      const row = restoredTask(await readJson(req));
      if (store.hasTask(row.id)) throw new HttpError(409, 'Tâche déjà présente');
      if (!store.hasProject(row.project_id)) throw new HttpError(400, 'Projet introuvable');
      send(res, 201, store.restoreTask(row));
    }],

    ['GET', /^\/api\/export$/, (_req, res) => {
      const file = tmpFile('.sqlite');
      try {
        store.exportTo(file);
        const data = fs.readFileSync(file);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.sqlite3',
          'Content-Disposition': `attachment; filename="tasks-${today()}.sqlite"`,
        });
        res.end(data);
      } finally {
        fs.rmSync(file, { force: true });
      }
    }],

    ['POST', /^\/api\/import$/, async (req, res) => {
      const file = tmpFile('.sqlite');
      requireType(req, 'application/octet-stream');
      try {
        fs.writeFileSync(file, await readBody(req), { mode: 0o600 });
        store.replaceWith(file);
      } catch (err) {
        throw err instanceof HttpError ? err : new HttpError(400, (err as Error).message);
      } finally {
        fs.rmSync(file, { force: true });
      }
      send(res, 200, { ok: true });
    }],

    ['POST', /^\/api\/import-markdown$/, async (req, res) => {
      requireType(req, 'text/markdown');
      const items = parseMarkdown((await readBody(req)).toString('utf8'));
      if (!items.length) throw new HttpError(400, 'Aucun projet ni tâche trouvé');
      send(res, 200, store.importItems(items));
    }],
  ];

  return async (req: Req, res: Res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      checkHost(req, allowedHosts);
      checkOrigin(req);
      const url = new URL(req.url ?? '/', 'http://x');
      if (!url.pathname.startsWith('/api/')) {
        if (!staticDir) throw new HttpError(404, 'Introuvable');
        return serveStatic(req, res, staticDir);
      }
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return await handler(req, res, url, ...m.slice(1));
      }
      throw new HttpError(404, 'Route inconnue');
    } catch (err) {
      // Ne jamais renvoyer le détail d'une erreur inattendue au client.
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Erreur interne';
      if (!res.headersSent) send(res, status, { error: message });
    }
  };
}
