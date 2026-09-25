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
      if (size > MAX_BODY) reject(new HttpError(413, 'Fichier trop volumineux'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
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
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Interdit' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Introuvable' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}

export function createApp(store) {
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
      try {
        fs.writeFileSync(file, await readBody(req));
        store.replaceWith(file);
      } catch (err) {
        throw err instanceof HttpError ? err : new HttpError(400, err.message);
      } finally {
        fs.rmSync(file, { force: true });
      }
      send(res, 200, { ok: true });
    }],

    ['POST', /^\/api\/import-markdown$/, async (req, res) => {
      const items = parseMarkdown((await readBody(req)).toString('utf8'));
      if (!items.length) throw new HttpError(400, 'Aucun projet ni tâche trouvé');
      send(res, 200, store.importItems(items));
    }],
  ];

  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return await handler(req, res, url, ...m.slice(1));
      }
      throw new HttpError(404, 'Route inconnue');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (!res.headersSent) send(res, err.status ?? 500, { error: err.message });
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const store = new Store(process.env.TASKS_DB || path.join(PUBLIC_DIR, '..', 'data', 'tasks.db'));
  http.createServer(createApp(store)).listen(port, () => {
    console.log(`Tasks : http://localhost:${port}`);
  });
}
