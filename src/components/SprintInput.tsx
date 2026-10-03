import { useId, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Champ Sprint de la fiche : texte libre, avec les sprints de Jira proposés
// comme les tags (↑ / ↓ parcourent, Entrée ou clic choisit, Échap ferme la
// liste). Entrée sans proposition choisie : celle du champ (enregistrer).
export function SprintInput({
  suggestions,
  value,
  onValue,
  onKeyDown,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  suggestions: string[]; // sprints actifs puis à venir (vide : texte libre seul)
  value: string;
  onValue: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Propositions contenant le texte (toutes si le champ vaut déjà un sprint).
  const q = fold(value.trim());
  const options = suggestions.includes(value) ? suggestions : suggestions.filter((s) => fold(s).includes(q));
  const shown = open && !props.readOnly && options.length > 0;

  const choose = (sprint: string) => {
    onValue(sprint);
    setOpen(false);
    setActive(-1);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      if (n) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n : i) - 1));
      return;
    }
    if (shown && e.key === 'Enter' && active >= 0 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      choose(options[active]);
      return;
    }
    if (shown && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // la fiche reste ouverte
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Input
        {...props}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onValue(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Sprints" className="absolute top-full left-0 z-50 mt-1 min-w-full rounded-md border bg-background py-1 shadow-md">
          {options.map((sprint, i) => (
            <li
              key={sprint}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn('cursor-pointer px-2 py-0.5 text-sm', i === active && 'bg-accent')}
              // Avant le blur du champ : le clic choisit la proposition.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(sprint);
              }}
            >
              {sprint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
