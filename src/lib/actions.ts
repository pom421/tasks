import { createContext, useContext } from 'react';


export interface Actions {
  // Exécute une action serveur, affiche l'erreur éventuelle, recharge les
  // données et restaure le focus clavier (stay : garder la même position).
  // fn peut renvoyer { focus: clé } pour focaliser un autre élément ensuite.
  act: (fn: () => Promise<unknown>, opts?: { stay?: boolean }) => Promise<void>;
  toast: (message: string) => void;
  setLastProject: (id: number) => void;
}

export const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ActionsContext manquant');
  return actions;
}
