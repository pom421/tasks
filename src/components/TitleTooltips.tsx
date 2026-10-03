import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const TOOLTIP_DELAY = 150;
export const TOOLTIP_CLASS = 'z-[100] max-w-md rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background';

// Info-bulles de toute l'app : au survol d'un élément qui a un attribut title,
// la même info-bulle, rapide (l'info-bulle native est lente et pas toujours
// affichée). Le title est retiré le temps du survol (sinon le navigateur
// afficherait aussi la sienne), puis remis.
export function TitleTooltips() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Centrée sur l'élément, recalée pour ne pas sortir de l'écran (largeur connue après rendu).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const width = el.offsetWidth;
    const center = tip.rect.left + tip.rect.width / 2;
    el.style.left = `${Math.min(Math.max(center - width / 2, 8), window.innerWidth - width - 8)}px`;
  }, [tip]);
  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer = 0;
    const hide = () => {
      clearTimeout(timer);
      // Remis seulement si React ne l'a pas changé entre-temps.
      if (current && !current.hasAttribute('title')) current.setAttribute('title', current.dataset.tip ?? '');
      if (current) delete current.dataset.tip;
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest<HTMLElement>('[title]');
      if (!el || el === current) return;
      hide();
      const text = el.getAttribute('title');
      if (!text) return;
      current = el;
      el.dataset.tip = text;
      el.removeAttribute('title');
      timer = window.setTimeout(() => setTip({ text, rect: el.getBoundingClientRect() }), TOOLTIP_DELAY);
    };
    const out = (e: PointerEvent) => {
      if (current && !current.contains(e.relatedTarget as Node | null)) hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    // Clic, touche ou défilement : l'info-bulle disparaît.
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  // Sous l'élément (au-dessus en bas d'écran).
  const below = tip.rect.bottom + 40 < window.innerHeight;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className={`title-tooltip pointer-events-none fixed ${TOOLTIP_CLASS}`}
      style={{ top: below ? tip.rect.bottom + 4 : tip.rect.top - 4, transform: below ? undefined : 'translateY(-100%)' }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
