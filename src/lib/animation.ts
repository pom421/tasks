import { useAutoAnimate } from '@formkit/auto-animate/react';

// Animation des listes (AutoAnimate) : ajout, retrait et déplacement des
// enfants directs de l'élément qui reçoit la ref. Courte, pour ne pas gêner
// les enchaînements au clavier (Alt+↓ répété). Désactivée si le système
// demande de réduire les animations (prefers-reduced-motion).
export function useListAnimation<T extends HTMLElement>() {
  const [ref] = useAutoAnimate<T>({ duration: 180, easing: 'ease-out' });
  return ref;
}
