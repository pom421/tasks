// Faux Jira Data Center des tests (API et e2e) : tickets en mémoire, PAT
// « secret » en Bearer, champ Sprint (customfield_10105, ancien format texte) et
// un tableau Scrum par projet avec ses sprints.
import http from 'node:http';

export interface FakeIssue {
  summary: string;
  description: string | null;
  duedate: string | null;
  sprint?: string | null; // nom du sprint du ticket
}

const SPRINT_FIELD = 'customfield_10105';
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
    if (url === '/rest/api/2/field') return json(res, [{ id: 'summary' }, { id: SPRINT_FIELD, schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } }]);
    if (url.startsWith('/rest/agile/1.0/board?')) return json(res, { values: [{ id: 1 }] });
    if (url.startsWith('/rest/agile/1.0/board/1/sprint?')) return json(res, { values: SPRINTS.filter((s) => s.state !== 'CLOSED').map(({ id, name }) => ({ id, name })) });
    const key = url.match(/\/rest\/api\/2\/issue\/([^?]+)/)?.[1] ?? '';
    const issue = issues[key];
    if (!issue) return res.writeHead(404).end();
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const { fields } = JSON.parse(Buffer.concat(chunks).toString());
      if (!fields.summary) return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ errors: { summary: 'obligatoire' } }));
      const sprint = SPRINT_FIELD in fields ? (SPRINTS.find((s) => s.id === fields[SPRINT_FIELD])?.name ?? null) : (issue.sprint ?? null);
      issues[key] = { summary: fields.summary, description: fields.description, duedate: fields.duedate, sprint };
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
