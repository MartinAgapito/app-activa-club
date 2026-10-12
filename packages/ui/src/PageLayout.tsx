// Layout de página base de la design foundation de Activa Club.
// Mobile-first: encabezado fijo compacto, contenido centrado con ancho máximo
// y gutters responsive. Sin navegación ni datos de sesión: cada app compone
// su propia barra de navegación (pública, socio o administrador) como `header`.

import type { ReactNode } from 'react';
import { cn } from './cn';

export interface PageLayoutProps {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Clase adicional para el contenedor de contenido (p. ej. ancho máximo distinto). */
  className?: string;
  /** `id` del `<main>`; con él, el contenido es destino de un enlace "Saltar al contenido". */
  mainId?: string;
}

export function PageLayout({ header, footer, children, className, mainId }: PageLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-app text-ink">
      {header ? (
        <header className="sticky top-0 z-layer-header border-b border-line bg-surface-card/95 backdrop-blur">
          {header}
        </header>
      ) : null}
      <main
        {...(mainId ? { id: mainId, tabIndex: -1 } : {})}
        className={cn(
          'mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8',
          mainId && 'focus:outline-none',
          className,
        )}
      >
        {children}
      </main>
      {footer ? <footer className="border-t border-line bg-surface-card">{footer}</footer> : null}
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Encabezado de sección dentro del contenido (título + descripción + acciones). */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="type-page-title text-ink">{title}</h1>
        {description ? <p className="measure mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
