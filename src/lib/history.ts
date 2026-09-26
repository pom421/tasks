import { create } from 'zustand';

// Historique des actions, en mémoire vive dans le navigateur seulement (perdu
// au rechargement) ; pas d'autre limite que cette mémoire : u annule la
// dernière, U la rejoue. Une nouvelle action efface ce qui pouvait être rejoué.
export interface Entry {
  label: string; // « tâche cochée » : affiché « Annulé : … » / « Rétabli : … »
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
  focus: string; // élément à resélectionner ensuite (clé de navigation)
}

interface History {
  past: Entry[]; // la plus récente en dernier
  future: Entry[]; // annulées, la prochaine à rejouer en dernier
  record: (entry: Entry) => void;
  undone: () => void; // dernière de past annulée : passe dans future
  redone: () => void; // dernière de future rejouée : repasse dans past
  clear: () => void;
}

export const useHistory = create<History>()((set) => ({
  past: [],
  future: [],
  record: (entry) => set((s) => ({ past: [...s.past, entry], future: [] })),
  undone: () => set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, ...s.past.slice(-1)] })),
  redone: () => set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, ...s.future.slice(-1)] })),
  clear: () => set({ past: [], future: [] }),
}));

// Enregistre une action réussie (hors composant React : fiche, file d'attente…).
export const record = (entry: Entry) => useHistory.getState().record(entry);
