// Crée un élément : h('li.task', { onclick }, enfant1, enfant2...)
export function h(tag, props = {}, ...children) {
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

// Nom navigable au clavier. Clic ou Entrée -> champ d'édition :
// Entrée enregistre, Échap annule et rend le focus au nom, perte de focus annule.
// onSave(valeur) renvoie une promesse ; le re-rendu qui suit restaure le focus.
export function editable(value, navKey, onSave) {
  const span = h('span.name', {
    textContent: value,
    title: 'Cliquer ou Entrée pour modifier',
    tabIndex: 0,
    dataset: { nav: '', navKey },
  });
  const start = () => {
    // Même clé que le nom : le focus revient sur lui après enregistrement.
    const input = h('input.edit', { value, autocomplete: 'off', dataset: { navKey } });
    let done = false;
    const finish = (save, refocus) => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (save && next && next !== value) return onSave(next);
      input.replaceWith(span);
      if (refocus) span.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true, true);
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false, true);
      }
    });
    input.addEventListener('blur', () => finish(false));
    span.replaceWith(input);
    input.focus();
    input.select();
  };
  span.addEventListener('click', start);
  span.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      start();
    }
  });
  return span;
}

// Champ d'ajout, lui aussi étape de navigation. Échap vide la saisie.
// onAdd(valeur, vider) : appeler vider() une fois l'ajout réussi.
export function addInput(placeholder, navKey, onAdd, props = {}) {
  return h('input.add', {
    placeholder,
    autocomplete: 'off',
    ...props,
    dataset: { nav: '', navKey, ...props.dataset },
    onkeydown: (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.target.value = '';
      }
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      const input = e.target;
      onAdd(input.value.trim(), () => (input.value = ''));
    },
  });
}
