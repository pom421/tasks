import { createContext, useContext } from 'react';
import type { Settings, Task } from '../../shared/types.ts';

// Champ à focaliser à l'ouverture de la fiche d'une tâche.
export type TaskField = 'notes' | 'jira';


export interface Actions {
  // Exécute une action serveur, affiche l'erreur éventuelle, recharge les
  // données et restaure le focus clavier (stay : garder la même position).
  // fn peut renvoyer { focus: clé } pour focaliser un autre élément ensuite.
  act: (fn: () => Promise<unknown>, opts?: { stay?: boolean }) => Promise<void>;
  toast: (message: string) => void;
  setLastProject: (id: number) => void;
  openTask: (task: Task, field?: TaskField) => void;
  settings: Settings;
  navigate: (path: string) => void;
}

export const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ActionsContext manquant');
  return actions;
}
