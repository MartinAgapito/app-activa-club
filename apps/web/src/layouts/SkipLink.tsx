import type { MouseEvent } from 'react';

import { MAIN_CONTENT_ID } from './navigation';

/**
 * Enlace "Saltar al contenido": primer elemento enfocable de la página. Está
 * oculto hasta recibir el foco y lo lleva al `<main id>` (que tiene
 * `tabIndex=-1`). Se maneja el clic para no depender del comportamiento del
 * ancla con el enrutador.
 */
export function SkipLink() {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    event.preventDefault();
    main.focus();
    main.scrollIntoView?.();
  };

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={handleClick}
      className="sr-only rounded-control bg-surface-card px-4 py-2 text-sm font-semibold text-action shadow-panel focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-layer-toast focus-ring"
    >
      Saltar al contenido
    </a>
  );
}
