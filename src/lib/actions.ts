import { createContext, useContext } from 'react';
import type { Settings, Task } from '../../shared/types.ts';

// Ouverture de la fiche : lecture (notes), édition complète (edit, focus sur
// le titre) ou édition rapide du ticket (jira).
export type TaskField = 'notes' | 'edit' | 'jira';


// Dernière action annulable (u) : libellé, opération inverse, tâche à resélectionner.
export interface Undo {
  label: string;
  run: () => Promise<unknown>;
  focus: string;
}

export interface Actions {
  // Exécute une action serveur, affiche l'erreur éventuelle, recharge les
  // données et restaure le focus clavier (stay : garder la même position).
  // fn peut renvoyer { focus: clé } pour focaliser un autre élément ensuite.
  act: (fn: () => Promise<unknown>, opts?: { stay?: boolean }) => Promise<void>;
  toast: (message: string) => void;
  setLastProject: (id: number) => void;
  openTask: (task: Task, field?: TaskField) => void;
  // Mémorise l'annulation de la dernière action (une seule, remplacée à chaque fois).
  setUndo: (undo: Undo) => void;
  settings: Settings;
  navigate: (path: string) => void;
}

export const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ActionsContext manquant');
  return actions;
}
