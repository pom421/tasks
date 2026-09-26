import { createContext, useContext } from 'react';
import type { Settings, Task } from '../../shared/types.ts';

// Ouverture de la fiche : lecture (notes), édition complète (edit, focus sur
// le titre) ou édition rapide du ticket (jira).
export type TaskField = 'notes' | 'edit' | 'jira';

// Action annulable (u) et rejouable (U). run peut renvoyer { focus: clé }
// comme pour act. redo : run par défaut (actions qui fixent une valeur).
// focus : élément à resélectionner après u / U ; fonction si la clé n'est
// connue qu'après run (création).
export interface Undoable {
  label: string;
  focus: string | (() => string);
  run: () => Promise<unknown>;
  undo: () => Promise<unknown>;
  redo?: () => Promise<unknown>;
  stay?: boolean;
}

export interface Actions {
  // Exécute une action serveur, affiche l'erreur éventuelle, recharge les
  // données et restaure le focus clavier (stay : garder la même position).
  // fn peut renvoyer { focus: clé } pour focaliser un autre élément ensuite.
  act: (fn: () => Promise<unknown>, opts?: { stay?: boolean }) => Promise<void>;
  toast: (message: string) => void;
  setLastProject: (id: number) => void;
  openTask: (task: Task, field?: TaskField) => void;
  // Comme act, puis inscrit l'action dans l'historique si elle a réussi.
  undoable: (action: Undoable) => Promise<void>;
  settings: Settings;
  navigate: (path: string) => void;
}

export const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ActionsContext manquant');
  return actions;
}
