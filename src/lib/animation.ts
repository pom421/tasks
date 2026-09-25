import { useEffect } from 'react';
import type { AutoAnimationPlugin } from '@formkit/auto-animate';
import { useAutoAnimate } from '@formkit/auto-animate/react';

const DURATION = 180;
const EASING = 'ease-out';

// Effets symétriques : un élément qui apparaît est visible dès le début
// (fondu + léger glissement), comme celui qui disparaît. L'effet d'entrée par
// défaut d'AutoAnimate reste invisible la moitié du temps puis surgit : au
// retour d'un filtre, on ne voyait presque rien.
const effects: AutoAnimationPlugin = (el, action, oldCoords, newCoords) => {
  let keyframes: Keyframe[];
  if (action === 'add') {
    keyframes = [
      { opacity: 0, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ];
  } else if (action === 'remove') {
    keyframes = [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-6px)' },
    ];
  } else {
    // Déplacement (FLIP) : de l'ancienne position à la nouvelle.
    const dx = (oldCoords?.left ?? 0) - (newCoords?.left ?? 0);
    const dy = (oldCoords?.top ?? 0) - (newCoords?.top ?? 0);
    keyframes = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }];
  }
  return new KeyframeEffect(el, keyframes, { duration: DURATION, easing: EASING });
};

// Animation des listes (AutoAnimate) : ajout, retrait et déplacement des
// enfants directs de l'élément qui reçoit la ref. Courte, pour ne pas gêner
// les enchaînements au clavier (Alt+↓ répété). Coupée si le système demande
// de réduire les animations (avec des effets sur mesure, AutoAnimate ne le
// fait pas lui-même).
export function useListAnimation<T extends HTMLElement>() {
  const [ref, setEnabled] = useAutoAnimate<T>(effects);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setEnabled(!reduce.matches);
    apply();
    reduce.addEventListener('change', apply);
    return () => reduce.removeEventListener('change', apply);
  }, [setEnabled]);
  return ref;
}
