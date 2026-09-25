import { api } from './api.js';
import { h, editable, addInput } from './dom.js';
import { installNav, snapshot, restore, focusByKey } from './nav.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  projects: [],
  showArchived: false,
  filter: { from: '', to: '', project: '' },
  lastProjectId: null, // pour le raccourci "n"
};

// --- Utilitaires -------------------------------------------------------------

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDay(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

// Exécute une action serveur, affiche l'erreur éventuelle, puis rafraîchit
// l'affichage en conservant le focus clavier (voir nav.js).
// fn peut renvoyer { focus: clé } pour placer le focus sur un autre élément.
async function act(fn, { stay = false } = {}) {
  let result;
  try {
    result = await fn();
  } catch (err) {
    toast(err.message);
  }
  // Après fn (qui a pu vider un champ d'ajout), juste avant le re-rendu.
  const snap = snapshot();
  try {
    await refresh();
  } catch (err) {
    toast(err.message);
  }
  if (result?.focus) focusByKey(result.focus);
  else restore(snap, { stay });
}

const patchTask = (id, body, opts) => act(() => api('PATCH', `/api/tasks/${id}`, body), opts);

function deleteTask(task) {
  if (confirm(`Supprimer « ${task.title} » ?`)) act(() => api('DELETE', `/api/tasks/${task.id}`), { stay: true });
}

// Nom de tâche : Espace coche / décoche, Suppr supprime.
function taskName(task, done) {
  const span = editable(task.title, `task:${task.id}`, (title) => patchTask(task.id, { title }));
  span.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      patchTask(task.id, done ? { done: false } : { done: true, done_at: localToday() }, { stay: true });
    }
    if (e.key === 'Delete') deleteTask(task);
  });
  return span;
}

// --- Rendu : projets ---------------------------------------------------------

function renderTask(task) {
  return h('li.task',
    {},
    h('input', {
      type: 'checkbox',
      title: 'Marquer comme faite',
      onchange: () => patchTask(task.id, { done: true, done_at: localToday() }),
    }),
    taskName(task, false),
    h('span.actions', {},
      h('button.icon.danger', {
        type: 'button', textContent: '✕', title: 'Supprimer la tâche (Suppr)',
        onclick: () => deleteTask(task),
      }),
    ),
  );
}

function renderProject(p) {
  const archived = Boolean(p.archived_at);
  return h(`div.project${archived ? '.archived' : ''}`,
    { id: `project-${p.id}` },
    h('div.project-head', {},
      editable(p.name, `project:${p.id}`, (name) => act(() => api('PATCH', `/api/projects/${p.id}`, { name }))),
      h('span.count', { textContent: p.tasks.length || '' }),
      h('span.actions', {},
        h('button.icon', {
          type: 'button',
          textContent: archived ? 'désarchiver' : 'archiver',
          onclick: () => act(() => api('PATCH', `/api/projects/${p.id}`, { archived: !archived })),
        }),
        h('button.icon.danger', {
          type: 'button', textContent: 'supprimer',
          onclick: () =>
            confirm(`Supprimer le projet « ${p.name} » et toutes ses tâches (y compris l'historique) ?`) &&
            act(() => api('DELETE', `/api/projects/${p.id}`)),
        }),
      ),
    ),
    h('ul', {}, ...p.tasks.map(renderTask)),
    addInput(
      '+ Ajouter une tâche',
      `add:${p.id}`,
      (title, clear) =>
        act(async () => {
          await api('POST', '/api/tasks', { project_id: p.id, title });
          clear();
        }),
      { onfocus: () => (state.lastProjectId = p.id), dataset: { project: p.id } },
    ),
  );
}

function renderProjects() {
  const visible = state.projects.filter((p) => state.showArchived || !p.archived_at);
  const root = $('#projects');
  root.replaceChildren(...visible.map(renderProject));
  if (!visible.length) root.append(h('p.empty', { textContent: 'Aucun projet. Créez-en un ci-dessous.' }));
}

// --- Rendu : journal ---------------------------------------------------------

function renderFilterOptions() {
  const select = $('#filter-project');
  select.replaceChildren(
    h('option', { value: '', textContent: 'Tous les projets' }),
    ...state.projects.map((p) =>
      h('option', { value: p.id, textContent: p.name + (p.archived_at ? ' (archivé)' : '') }),
    ),
  );
  select.value = state.filter.project;
  if (select.value !== state.filter.project) state.filter.project = '';
}

function renderDoneTask(task) {
  const dateBtn = h('button.icon', { type: 'button', textContent: 'date', title: 'Changer la date' });
  dateBtn.addEventListener('click', () => {
    const input = h('input', { type: 'date', value: task.done_at });
    input.addEventListener('change', () =>
      input.value && patchTask(task.id, { done_at: input.value }),
    );
    input.addEventListener('keydown', (e) => e.key === 'Escape' && input.replaceWith(dateBtn));
    dateBtn.replaceWith(input);
    input.focus();
  });
  return h('li.task', {},
    h('input', {
      type: 'checkbox',
      checked: true,
      title: 'Remettre à faire',
      onchange: () => patchTask(task.id, { done: false }),
    }),
    taskName(task, true),
    h('span.actions', {},
      dateBtn,
      h('button.icon.danger', {
        type: 'button', textContent: '✕', title: 'Supprimer (Suppr)',
        onclick: () => deleteTask(task),
      }),
    ),
  );
}

function renderDay(day, showProjects) {
  const groups = [];
  for (const t of day.tasks) {
    let g = groups.at(-1);
    if (g?.id !== t.project_id) groups.push((g = { id: t.project_id, name: t.project_name, tasks: [] }));
    g.tasks.push(t);
  }
  return h('div.day', {},
    h('h3', { textContent: formatDay(day.date) }),
    ...groups.flatMap((g) => [
      showProjects && h('div.project-label', { textContent: g.name }),
      h('ul', {}, ...g.tasks.map(renderDoneTask)),
    ]),
  );
}

async function renderJournal() {
  const params = new URLSearchParams();
  const { from, to, project } = state.filter;
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (project) params.set('project', project);
  const { days } = await api('GET', `/api/journal?${params}`);
  const filtered = Boolean(from || to || project);
  $('#filter-reset').hidden = !filtered;
  $('#filter-from').value = from;
  $('#filter-to').value = to;
  $('#filter-to').min = from;
  const empty = filtered ? 'Aucune tâche faite pour ce filtre.' : 'Aucune tâche faite pour l’instant.';
  $('#journal-days').replaceChildren(...days.map((d) => renderDay(d, !state.filter.project)));
  if (!days.length) $('#journal-days').append(h('p.empty', { textContent: empty }));
}

async function refresh() {
  ({ projects: state.projects } = await api('GET', '/api/state'));
  renderProjects();
  renderFilterOptions();
  await renderJournal();
}

// --- Événements globaux ------------------------------------------------------

$('#new-project').replaceWith(
  addInput(
    '+ Nouveau projet (p)',
    'new-project',
    (name, clear) =>
      act(async () => {
        const project = await api('POST', '/api/projects', { name });
        clear();
        // Projet neuf, sans tâche : on enchaîne sur la saisie de la première.
        return { focus: `add:${project.id}` };
      }),
    { id: 'new-project' },
  ),
);

$('#show-archived').addEventListener('change', (e) => {
  state.showArchived = e.target.checked;
  renderProjects();
});

// Saisie clavier d'une date : le navigateur émet « change » dès que la valeur
// est valide, y compris pendant la frappe de l'année (0002, 0020, 0202…).
// On attend une année à 4 chiffres avant d'agir.
const isComplete = (value) => value === '' || Number(value.slice(0, 4)) >= 1000;

const showJournal = () => renderJournal().catch((err) => toast(err.message));

// Date de début renseignée : la date de fin prend la même valeur (une journée)
// et reçoit le focus pour être ajustée si besoin.
$('#filter-from').addEventListener('change', (e) => {
  const from = e.target.value;
  if (!isComplete(from)) return;
  state.filter.from = from;
  if (from) {
    state.filter.to = from;
    $('#filter-to').value = from;
    $('#filter-to').focus();
  }
  showJournal();
});

$('#filter-to').addEventListener('change', (e) => {
  const to = e.target.value;
  if (!isComplete(to)) return;
  if (to && state.filter.from && to < state.filter.from) {
    toast('La date de fin doit être après la date de début');
    e.target.value = state.filter.to;
    return;
  }
  state.filter.to = to;
  showJournal();
});

$('#filter-project').addEventListener('change', (e) => {
  state.filter.project = e.target.value;
  showJournal();
});
function resetFilters() {
  state.filter = { from: '', to: '', project: '' };
  $('#filter-project').value = '';
  showJournal();
}
$('#filter-reset').addEventListener('click', resetFilters);

$('#import-db-btn').addEventListener('click', () => $('#import-db').click());
$('#import-db').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Remplacer TOUTE la base actuelle par ce fichier ?\nPensez à exporter avant.')) return;
  act(async () => {
    await api('POST', '/api/import', file);
    toast('Base importée');
  });
});

$('#import-md-btn').addEventListener('click', () => $('#import-md').click());
$('#import-md').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  act(async () => {
    const r = await api('POST', '/api/import-markdown', await file.text());
    toast(`Import : ${r.projects} projet(s) créé(s), ${r.tasks} tâche(s)`);
  });
});

$('#help-btn').addEventListener('click', () => $('#help').showModal());

installNav();

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, select, textarea') || $('#help').open) return;
  const focusAdd = () => {
    const inputs = [...document.querySelectorAll('#projects input[data-project]')];
    const input = inputs.find((i) => i.dataset.project === String(state.lastProjectId)) ?? inputs[0];
    input?.focus();
  };
  const keys = {
    p: () => $('#new-project').focus(),
    n: focusAdd,
    d: () => $('#filter-from').focus(),
    f: () => $('#filter-project').focus(),
    '?': () => $('#help').showModal(),
    // Échap sur un élément de la liste : ne rien faire (on reste en navigation).
    Escape: () => e.target.dataset.nav === undefined && resetFilters(),
  };
  if (keys[e.key]) {
    e.preventDefault();
    keys[e.key]();
  }
});

refresh().catch((err) => toast(err.message));
