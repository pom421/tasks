// Faux Jira Data Center des tests (API et e2e) : tickets en mémoire, PAT
// « secret » en Bearer, champ Sprint (customfield_10105, ancien format texte) et
// un tableau Scrum par projet avec ses sprints.
import http from 'node:http';

export interface FakeIssue {
  summary: string;
  description: string | null;
  duedate: string | null;
  sprint?: string | null; // nom du sprint du ticket
  epic?: string; // epic auquel un ticket créé est rattaché (Epic Link)
}

const SPRINT_FIELD = 'customfield_10105';
const EPIC_FIELD = 'customfield_10100';
const SPRINTS = [
  { id: 41, name: 'Sprint 41', state: 'CLOSED' },
  { id: 42, name: 'Sprint 42', state: 'ACTIVE' },
  { id: 43, name: 'Sprint 43', state: 'FUTURE' },
];
const sprintText = (s: (typeof SPRINTS)[number]) =>
  `com.atlassian.greenhopper.service.sprint.Sprint@1a2b[id=${s.id},rapidViewId=1,state=${s.state},name=${s.name},startDate=<null>,sequence=${s.id}]`;

export async function fakeJira(issues: Record<string, FakeIssue>) {
  const json = (res: http.ServerResponse, body: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer secret') return res.writeHead(401).end();
    const url = req.url!;
    if (url === '/rest/api/2/field') return json(res, [
      { id: 'summary' },
      { id: SPRINT_FIELD, schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      { id: EPIC_FIELD, schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
    ]);
    // Types du projet (noms en français) : la tâche est choisie par son nom.
    if (/^\/rest\/api\/2\/project\/[A-Z]+$/.test(url)) {
      return json(res, { issueTypes: [{ id: '1', name: 'Epic' }, { id: '3', name: 'Tâche' }, { id: '5', name: 'Sous-tâche', subtask: true }] });
    }
    // Création : projet, type Tâche, Epic Link ; la clé est numérotée à partir de 100.
    if (req.method === 'POST' && url === '/rest/api/2/issue') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const { fields } = JSON.parse(Buffer.concat(chunks).toString());
      if (!fields.summary || fields.issuetype?.id !== '3' || !fields[EPIC_FIELD]) {
        return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ errors: { issuetype: 'invalide' } }));
      }
      const created = `${fields.project.key}-${100 + Object.keys(issues).length}`;
      const sprint = SPRINT_FIELD in fields ? (SPRINTS.find((s) => s.id === fields[SPRINT_FIELD])?.name ?? null) : null;
      issues[created] = { summary: fields.summary, description: fields.description ?? null, duedate: fields.duedate ?? null, sprint, epic: fields[EPIC_FIELD] };
      return res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: '1', key: created }));
    }
    // Deux tableaux Scrum (le sprint actif est sur les deux) ; fermés jamais demandés.
    if (url.startsWith('/rest/agile/1.0/board?')) return json(res, { values: url.includes('type=scrum') ? [{ id: 1 }, { id: 2 }] : [] });
    const board = url.match(/^\/rest\/agile\/1\.0\/board\/(\d)\/sprint\?state=active,future/)?.[1];
    if (board) {
      const open = SPRINTS.filter((s) => s.state !== 'CLOSED').reverse(); // à venir d'abord : le tri est au serveur
      return json(res, { values: (board === '1' ? open : open.slice(-1)).map(({ id, name, state }) => ({ id, name, state: state.toLowerCase() })) });
    }
    const key = url.match(/\/rest\/api\/2\/issue\/([^?]+)/)?.[1] ?? '';
    const issue = issues[key];
    if (!issue) return res.writeHead(404).end();
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const { fields } = JSON.parse(Buffer.concat(chunks).toString());
      if (!fields.summary) return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ errors: { summary: 'obligatoire' } }));
      const sprint = SPRINT_FIELD in fields ? (SPRINTS.find((s) => s.id === fields[SPRINT_FIELD])?.name ?? null) : (issue.sprint ?? null);
      issues[key] = { ...issue, summary: fields.summary, description: fields.description, duedate: fields.duedate, sprint };
      return res.writeHead(204).end();
    }
    // Sprints du ticket : le sprint fermé d'avant, puis le sien.
    const own = SPRINTS.find((s) => s.name === issue.sprint);
    const sprints = own ? [SPRINTS[0], own].filter((s, i, all) => all.indexOf(s) === i).map(sprintText) : null;
    json(res, { key, fields: { summary: issue.summary, description: issue.description, duedate: issue.duedate, [SPRINT_FIELD]: sprints } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}
