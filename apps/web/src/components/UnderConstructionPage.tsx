// Placeholder reutilizable para las pantallas de negocio del MVP que se
// implementarán en Sprint 1+ (ver docs/scrum/sprints/sprint-0.md: "no se
// incorpora funcionalidad de negocio" en Sprint 0). Cada ruta del mapa
// (apps/web/docs/mapa-de-rutas.md) renderiza esta pantalla hasta que su
// historia de usuario correspondiente se implemente.

import type { ReactNode } from 'react';
import { Badge, Card, EmptyState, PageHeader } from '@activa-club/ui';

export interface UnderConstructionPageProps {
  title: string;
  description: string;
  /** Endpoints del contrato que consumirá esta pantalla (solo referencia). */
  endpoints?: string[];
  /** Contenido adicional de referencia (p. ej. la nota de restricción por deuda). */
  children?: ReactNode;
}

export function UnderConstructionPage({
  title,
  description,
  endpoints,
  children,
}: UnderConstructionPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="warning">En construcción — Sprint 1</Badge>}
      />
      <EmptyState
        title="Esta pantalla todavía no está implementada"
        description="Corresponde a una historia de usuario de Sprint 1+. Esta ruta y su guard de acceso ya existen como parte de la fundación (US-008)."
      />
      {endpoints && endpoints.length > 0 ? (
        <Card compact>
          <h2 className="text-sm font-semibold text-slate-700">Contrato previsto</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
            {endpoints.map((endpoint) => (
              <li key={endpoint}>
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {children}
    </div>
  );
}
