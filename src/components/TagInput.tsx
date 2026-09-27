import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Hash, X } from 'lucide-react';
import { normalizeTag } from '../../shared/types.ts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface TagInputProps {
  id?: string;
  tags: string[];
  suggestions: string[]; // tags existants, proposés à la saisie
  onChange: (tags: string[]) => void;
  label: string; // nom du champ (lecteurs d'écran)
  title?: string;
  placeholder?: string;
  create?: boolean; // accepte un tag nouveau (fiche) ; sinon seulement ceux proposés (filtres)
  removeLabel: (tag: string) => string;
  className?: string;
}

// Tags choisis en pastilles (✕ pour retirer), puis un champ avec
// autocomplétion : ↑ / ↓ parcourent les propositions, Entrée (ou virgule)
// ajoute, Retour arrière dans le champ vide retire le dernier, Échap vide le
// champ et ferme la liste.
export function TagInput({ id, tags, suggestions, onChange, label, title, placeholder, create, removeLabel, className }: TagInputProps) {
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  // Propositions : pas encore choisies, contenant le texte ; celles qui
  // commencent par lui d'abord.
  const q = fold(text.replace(/^#+/, '').trim());
  const options = suggestions
    .filter((s) => !tags.includes(s) && fold(s).includes(q))
    .sort((a, b) => Number(!fold(a).startsWith(q)) - Number(!fold(b).startsWith(q)))
    .slice(0, 8);
  const shown = open && options.length > 0;

  const add = (tag: string | null) => {
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setText('');
    setActive(-1);
    setOpen(false);
  };
  // Texte saisi : tag nouveau (fiche) ou meilleure proposition (filtres). Tag
  // invalide (fiche) : le texte reste, à corriger.
  const addTyped = () => {
    const tag = active >= 0 ? options[active] : create ? normalizeTag(text) : (options[0] ?? null);
    if (tag || !create) add(tag);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      if (n) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n : i) - 1));
    } else if ((e.key === 'Enter' || e.key === ',') && (text.trim() || active >= 0)) {
      // Ctrl+Entrée (fiche) : ajoute le tag tapé, puis enregistre (l'événement continue).
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
      addTyped();
    } else if (e.key === 'Backspace' && !text && tags.length) {
      onChange(tags.slice(0, -1));
    } else if (e.key === 'Escape' && (text || shown)) {
      e.preventDefault();
      e.stopPropagation();
      add(null);
    }
  };

  return (
    <div
      className={cn(
        'tag-input relative flex min-h-[26px] flex-wrap items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        className,
      )}
      title={title}
    >
      <Hash aria-hidden className={cn('size-3.5 flex-none', tags.length ? 'text-foreground' : 'text-muted-foreground')} />
      {tags.map((tag) => (
        <span key={tag} className="tag-chip inline-flex items-center rounded-full border pl-1.5 text-xs leading-[18px]">
          {tag}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            className="size-[18px] rounded-full text-muted-foreground hover:text-foreground [&_svg]:size-3"
            aria-label={removeLabel(tag)}
            title={removeLabel(tag)}
            onClick={() => {
              onChange(tags.filter((t) => t !== tag));
              input.current?.focus();
            }}
          >
            <X aria-hidden />
          </Button>
        </span>
      ))}
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="min-w-16 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder={tags.length ? '' : placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        // Fiche : un tag tapé mais pas validé n'est pas perdu.
        onBlur={() => (create && text.trim() ? addTyped() : add(null))}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute top-full left-0 z-50 mt-1 min-w-full rounded-md border bg-background py-1 shadow-md">
          {options.map((tag, i) => (
            <li
              key={tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn('cursor-pointer px-2 py-0.5 text-sm', i === active && 'bg-accent')}
              // Avant le blur du champ : le clic choisit la proposition.
              onMouseDown={(e) => {
                e.preventDefault();
                add(tag);
              }}
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
