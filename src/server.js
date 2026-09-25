import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, isDate, today } from './db.js';
import { parseMarkdown } from './markdown.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const MAX_BODY = 50 * 1024 * 1024;

// En-têtes de sécurité sur toutes les réponses. Le front n'a ni script
// inline ni ressource externe : 'self' suffit partout.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
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
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
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
function requireType(req, type) {
  const actual = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (actual !== type) throw new HttpError(415, `Content-Type attendu : ${type}`);
}

async function readJson(req) {
  requireType(req, 'application/json');
  const buf = await readBody(req);
  try {
    return buf.length ? JSON.parse(buf) : {};
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} requis`);
  return value.trim();
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `tasks-${crypto.randomUUID()}${ext}`);
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Anti-CSRF : toute requête qui modifie des données doit venir de la page elle-même.
function checkOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
    throw new HttpError(403, 'Requête inter-sites refusée');
  }
  const origin = req.headers.origin;
  if (origin && URL.parse(origin)?.host !== req.headers.host) {
    throw new HttpError(403, 'Origine refusée');
  }
}

function checkHost(req, allowedHosts) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!allowedHosts.includes(host)) throw new HttpError(421, 'Hôte non autorisé');
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Méthode non autorisée' });
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, { error: 'URL invalide' });
  }
  const file = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Interdit' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Introuvable' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}

export function createApp(store, { allowedHosts = DEFAULT_ALLOWED_HOSTS } = {}) {
  // Table de routage : [méthode, regex, handler(req, res, ...params)].
  const routes = [
    ['GET', /^\/api\/state$/, (req, res) => send(res, 200, store.state())],

    ['GET', /^\/api\/journal$/, (req, res, url) => {
      const date = url.searchParams.get('date') || undefined;
      const projectId = Number(url.searchParams.get('project')) || undefined;
      if (date && !isDate(date)) throw new HttpError(400, 'Date invalide');
      send(res, 200, store.journal({ date, projectId }));
    }],

    ['POST', /^\/api\/projects$/, async (req, res) => {
      const { name } = await readJson(req);
      send(res, 201, store.createProject(requireText(name, 'Nom')));
    }],

    ['PATCH', /^\/api\/projects\/(\d+)$/, async (req, res, url, id) => {
      const body = await readJson(req);
      const patch = {};
      if ('name' in body) patch.name = requireText(body.name, 'Nom');
      if ('archived' in body) patch.archived = Boolean(body.archived);
      const project = store.updateProject(Number(id), patch);
      if (!project) throw new HttpError(404, 'Projet introuvable');
      send(res, 200, project);
    }],

    ['DELETE', /^\/api\/projects\/(\d+)$/, (req, res, url, id) => {
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

    ['PATCH', /^\/api\/tasks\/(\d+)$/, async (req, res, url, id) => {
      const body = await readJson(req);
      const patch = {};
      if ('title' in body) patch.title = requireText(body.title, 'Titre');
      // done: true -> faite (à done_at ou aujourd'hui), false -> à faire.
      if ('done' in body) patch.doneAt = body.done ? body.done_at ?? today() : null;
      else if ('done_at' in body) patch.doneAt = body.done_at;
      if (patch.doneAt && !isDate(patch.doneAt)) throw new HttpError(400, 'Date invalide');
      const task = store.updateTask(Number(id), patch);
      if (!task) throw new HttpError(404, 'Tâche introuvable');
      send(res, 200, task);
    }],

    ['DELETE', /^\/api\/tasks\/(\d+)$/, (req, res, url, id) => {
      if (!store.deleteTask(Number(id))) throw new HttpError(404, 'Tâche introuvable');
      send(res, 200, { ok: true });
    }],

    ['GET', /^\/api\/export$/, (req, res) => {
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
        throw err instanceof HttpError ? err : new HttpError(400, err.message);
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

  return async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      checkHost(req, allowedHosts);
      checkOrigin(req);
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return await handler(req, res, url, ...m.slice(1));
      }
      throw new HttpError(404, 'Route inconnue');
    } catch (err) {
      // Ne jamais renvoyer le détail d'une erreur inattendue au client.
      if (!(err instanceof HttpError)) console.error(err);
      const message = err instanceof HttpError ? err.message : 'Erreur interne';
      if (!res.headersSent) send(res, err.status ?? 500, { error: message });
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  // Écoute sur la boucle locale uniquement : l'app n'a pas d'authentification.
  const host = process.env.HOST || '127.0.0.1';
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim().toLowerCase());
  const store = new Store(process.env.TASKS_DB || path.join(PUBLIC_DIR, '..', 'data', 'tasks.db'));
  const server = http.createServer(createApp(store, allowedHosts && { allowedHosts }));
  server.requestTimeout = 30_000;
  server.listen(port, host, () => {
    console.log(`Tasks : http://localhost:${port}`);
  });
}
