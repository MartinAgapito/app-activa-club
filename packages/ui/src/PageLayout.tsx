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
}

export function PageLayout({ header, footer, children, className }: PageLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {header ? (
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
          {header}
        </header>
      ) : null}
      <main className={cn('mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8', className)}>
        {children}
      </main>
      {footer ? <footer className="border-t border-slate-200 bg-white">{footer}</footer> : null}
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
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
