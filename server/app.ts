import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { type Store, isDate, today } from './db.ts';
import type { JiraState } from '../shared/types.ts';
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

// Lien Jira : http(s) uniquement. Un lien « javascript: » placé dans un href
// exécuterait du code au clic (XSS).
function jiraUrl(value: unknown): string | null {
  if (value === null || value === '') return null;
  const url = typeof value === 'string' && value.length <= 2000 ? URL.parse(value.trim()) : null;
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new HttpError(400, 'Lien invalide : adresse http(s) attendue');
  }
  return url.href;
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
      if ((from && !isDate(from)) || (to && !isDate(to))) throw new HttpError(400, 'Date invalide');
      if (from && to && from > to) throw new HttpError(400, 'La date de début est après la date de fin');
      send(res, 200, store.journal({ from, to, projectId, jiraPending }));
    }],

    ['POST', /^\/api\/projects$/, async (req, res) => {
      const { name } = await readJson(req);
      send(res, 201, store.createProject(requireText(name, 'Nom')));
    }],

    ['PATCH', /^\/api\/projects\/(\d+)$/, async (req, res, _url, id) => {
      const body = await readJson(req);
      const patch: { name?: string; archived?: boolean } = {};
      if ('name' in body) patch.name = requireText(body.name, 'Nom');
      if ('archived' in body) patch.archived = Boolean(body.archived);
      const project = store.updateProject(Number(id), patch);
      if (!project) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, project);
    }],

    ['DELETE', /^\/api\/projects\/(\d+)$/, (_req, res, _url, id) => {
      if (!store.deleteProject(Number(id))) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, { ok: true });
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
      const patch: { title?: string; doneAt?: string | null; jira?: JiraState; jiraUrl?: string | null } = {};
      if ('title' in body) patch.title = requireText(body.title, 'Titre');
      // done: true -> faite (à done_at ou aujourd'hui), false -> à faire.
      const doneAt = body.done_at ?? (body.done ? today() : null);
      if (('done' in body || 'done_at' in body) && doneAt !== null && !isDate(doneAt)) {
        throw new HttpError(400, 'Date invalide');
      }
      if ('done' in body) patch.doneAt = body.done ? (doneAt as string) : null;
      else if ('done_at' in body) patch.doneAt = doneAt as string | null;
      if ('jira' in body) {
        if (!['none', 'wanted', 'done'].includes(body.jira as string)) throw new HttpError(400, 'État Jira invalide');
        patch.jira = body.jira as JiraState;
      }
      if ('jira_url' in body) patch.jiraUrl = jiraUrl(body.jira_url);
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

    ['DELETE', /^\/api\/tasks\/(\d+)$/, (_req, res, _url, id) => {
      if (!store.deleteTask(Number(id))) throw new HttpError(404, 'Tâche introuvable');
      send(res, 200, { ok: true });
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
