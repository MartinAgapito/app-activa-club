// Estado de error base de la design foundation de Activa Club.
// Reutilizable por cualquier pantalla que consuma la API y deba comunicar un
// fallo (`error.code`/`error.message` del contrato, ver docs/api/contratos-api.md §1.1).

import type { ReactNode } from 'react';

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function ErrorState({
  title = 'Ocurrió un error',
  description = 'No pudimos completar la solicitud. Intenta nuevamente en unos minutos.',
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 px-6 py-10 text-center"
    >
      <h2 className="text-base font-semibold text-danger-900">{title}</h2>
      <p className="max-w-md text-sm text-danger-700">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
