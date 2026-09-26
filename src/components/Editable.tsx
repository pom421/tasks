import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { focusedByNav } from '@/lib/nav';

interface EditableNameProps {
  value: string;
  navKey: string;
  onSave: (value: string) => void;
  className?: string;
  // Sur une ligne, avec « … » si trop long ; titre complet en info-bulle.
  truncate?: boolean;
}

// Nom navigable au clavier. Clic ou Entrée -> champ d'édition :
// Entrée enregistre, Échap annule, dans les deux cas le focus revient au nom.
export function EditableName({ value, navKey, onSave, className, truncate = false }: EditableNameProps) {
  const [tooltip, setTooltip] = useState(false);
  const [editing, setEditing] = useState(false);
  const refocus = useRef(false);
  const span = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      span.current?.focus();
    }
  }, [editing]);

  const stop = (focusBack: boolean) => {
    refocus.current = focusBack;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="edit min-w-0 flex-1 bg-transparent leading-[inherit] shadow-[0_1px_0_var(--color-primary)] outline-none"
        defaultValue={value}
        autoFocus
        autoComplete="off"
        onFocus={(e) => e.currentTarget.select()}
        // Perte de focus = annulation, sauf si Entrée/Échap vient de fermer le champ.
        onBlur={() => !refocus.current && stop(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const next = e.currentTarget.value.trim();
            stop(true);
            if (next && next !== value) onSave(next);
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            stop(true);
          }
        }}
      />
    );
  }

  const name = (
    <span
      ref={span}
      className={cn('name cursor-text outline-none', truncate ? 'min-w-0 truncate' : '[overflow-wrap:anywhere]', className)}
      tabIndex={0}
      data-nav=""
      data-nav-key={navKey}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        // Maj+Entrée est laissée à la ligne (ouverture de la fiche d'une tâche).
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value}
    </span>
  );
  if (!truncate) return name;

  // Info-bulle au survol ou au focus clavier, seulement si le titre est coupé.
  const isTruncated = () => Boolean(span.current && span.current.scrollWidth > span.current.clientWidth);
  return (
    <Tooltip open={tooltip} onOpenChange={(open) => setTooltip(open && isTruncated())}>
      <TooltipTrigger asChild>{name}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="full-title">
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

interface AddInputProps {
  placeholder: string;
  navKey: string;
  // Renvoie true si l'ajout a réussi (le champ est alors vidé).
  onAdd: (value: string) => Promise<boolean>;
  onFocus?: () => void;
  id?: string;
  className?: string;
}

// Champ d'ajout, lui aussi étape de navigation. Atteint par la navigation
// (↑/↓, j/k…), il reste en lecture : les touches naviguent toujours, Entrée
// passe en écriture (comme pour modifier un titre). Par n, n n ou un clic : en
// écriture directement. Échap vide la saisie et repasse en lecture (curseur
// sur le champ).
export function AddInput({ placeholder, navKey, onAdd, onFocus, id, className }: AddInputProps) {
  const [value, setValue] = useState('');
  const [browsing, setBrowsing] = useState(false);
  return (
    <input
      id={id}
      className={cn(
        'add w-full border-b border-transparent bg-transparent py-0.5 pl-1 text-muted-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:text-foreground',
        browsing && 'caret-transparent',
        className,
      )}
      readOnly={browsing}
      placeholder={placeholder}
      autoComplete="off"
      data-nav=""
      data-nav-key={navKey}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => {
        setBrowsing(focusedByNav());
        onFocus?.();
      }}
      onBlur={() => setBrowsing(false)}
      onMouseDown={() => setBrowsing(false)}
      onKeyDown={async (e) => {
        if (browsing && e.key === 'Enter') {
          e.preventDefault();
          setBrowsing(false);
          return;
        }
        if (!browsing && e.key === 'Escape') {
          e.stopPropagation();
          setValue('');
          setBrowsing(true);
        }
        if (e.key === 'Enter' && value.trim() && (await onAdd(value.trim()))) setValue('');
      }}
    />
  );
}
