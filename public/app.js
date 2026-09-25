const $ = (sel) => document.querySelector(sel);

const state = {
  projects: [],
  showArchived: false,
  filter: { date: '', project: '' },
  lastProjectId: null, // pour le raccourci "n"
};

// --- Utilitaires -------------------------------------------------------------

// Le serveur exige un Content-Type précis par route (protection CSRF).
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof Blob) {
    opts.headers['Content-Type'] = 'application/octet-stream';
    opts.body = body;
  } else if (typeof body === 'string') {
    opts.headers['Content-Type'] = 'text/markdown';
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Crée un élément : h('li.task', { onclick }, enfant1, enfant2...)
function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name);
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

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

// Exécute une action serveur, affiche l'erreur éventuelle, puis rafraîchit l'affichage.
async function act(fn) {
  try {
    await fn();
  } catch (err) {
    toast(err.message);
  }
  await refresh().catch((err) => toast(err.message));
}

// Nom cliquable -> input ; Entrée valide, Échap ou perte de focus annule.
function editable(value, onSave) {
  const span = h('span.name', { textContent: value, title: 'Cliquer pour modifier', tabIndex: 0 });
  const start = () => {
    const input = h('input.edit', { value, autocomplete: 'off' });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (save && next && next !== value) act(() => onSave(next));
      else input.replaceWith(span);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(false));
    span.replaceWith(input);
    input.focus();
    input.select();
  };
  span.addEventListener('click', start);
  span.addEventListener('keydown', (e) => e.key === 'Enter' && start());
  return span;
}

function addInput(placeholder, onAdd, props = {}) {
  return h('input.add', {
    placeholder,
    autocomplete: 'off',
    ...props,
    onkeydown: (e) => {
      if (e.key === 'Escape') e.target.blur();
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      const value = e.target.value.trim();
      act(async () => {
        await onAdd(value);
        e.target.value = '';
      });
    },
  });
}

// --- Rendu : projets ---------------------------------------------------------

function renderTask(task) {
  return h('li.task',
    {},
    h('input', {
      type: 'checkbox',
      title: 'Marquer comme faite',
      onchange: () => act(() => api('PATCH', `/api/tasks/${task.id}`, { done: true, done_at: localToday() })),
    }),
    editable(task.title, (title) => api('PATCH', `/api/tasks/${task.id}`, { title })),
    h('span.actions', {},
      h('button.icon.danger', {
        type: 'button', textContent: '✕', title: 'Supprimer la tâche',
        onclick: () => confirm(`Supprimer « ${task.title} » ?`) && act(() => api('DELETE', `/api/tasks/${task.id}`)),
      }),
    ),
  );
}

function renderProject(p) {
  const archived = Boolean(p.archived_at);
  return h(`div.project${archived ? '.archived' : ''}`,
    { id: `project-${p.id}` },
    h('div.project-head', {},
      editable(p.name, (name) => api('PATCH', `/api/projects/${p.id}`, { name })),
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
    addInput('+ Ajouter une tâche', (title) => api('POST', '/api/tasks', { project_id: p.id, title }), {
      onfocus: () => (state.lastProjectId = p.id),
      dataset: { project: p.id },
    }),
  );
}

function renderProjects() {
  const visible = state.projects.filter((p) => state.showArchived || !p.archived_at);
  const root = $('#projects');
  // Préserve le focus et la saisie en cours dans un champ d'ajout.
  const active = document.activeElement;
  const focused = active?.dataset?.project;
  const draft = focused ? active.value : '';
  root.replaceChildren(...visible.map(renderProject));
  if (!visible.length) root.append(h('p.empty', { textContent: 'Aucun projet. Créez-en un ci-dessous.' }));
  if (focused) {
    const input = root.querySelector(`input[data-project="${focused}"]`);
    if (input) {
      input.value = draft;
      input.focus();
    }
  }
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
      input.value && act(() => api('PATCH', `/api/tasks/${task.id}`, { done_at: input.value })),
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
      onchange: () => act(() => api('PATCH', `/api/tasks/${task.id}`, { done: false })),
    }),
    editable(task.title, (title) => api('PATCH', `/api/tasks/${task.id}`, { title })),
    h('span.actions', {},
      dateBtn,
      h('button.icon.danger', {
        type: 'button', textContent: '✕', title: 'Supprimer',
        onclick: () => confirm(`Supprimer « ${task.title} » ?`) && act(() => api('DELETE', `/api/tasks/${task.id}`)),
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
  if (state.filter.date) params.set('date', state.filter.date);
  if (state.filter.project) params.set('project', state.filter.project);
  const { days } = await api('GET', `/api/journal?${params}`);
  const filtered = Boolean(state.filter.date || state.filter.project);
  $('#filter-reset').hidden = !filtered;
  $('#filter-date').value = state.filter.date;
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
  addInput('+ Nouveau projet (p)', (name) => api('POST', '/api/projects', { name }), { id: 'new-project' }),
);

$('#show-archived').addEventListener('change', (e) => {
  state.showArchived = e.target.checked;
  renderProjects();
});

$('#filter-date').addEventListener('change', (e) => {
  state.filter.date = e.target.value;
  renderJournal().catch((err) => toast(err.message));
});
$('#filter-project').addEventListener('change', (e) => {
  state.filter.project = e.target.value;
  renderJournal().catch((err) => toast(err.message));
});
function resetFilters() {
  state.filter = { date: '', project: '' };
  $('#filter-project').value = '';
  renderJournal().catch((err) => toast(err.message));
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
    d: () => $('#filter-date').focus(),
    f: () => $('#filter-project').focus(),
    '?': () => $('#help').showModal(),
    Escape: resetFilters,
  };
  if (keys[e.key]) {
    e.preventDefault();
    keys[e.key]();
  }
});

refresh().catch((err) => toast(err.message));
