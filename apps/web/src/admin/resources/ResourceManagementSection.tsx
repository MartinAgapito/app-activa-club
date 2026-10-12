// Gestión de instalaciones — interfaz de US-036 reorganizada en US-075.
//
// Catálogo de recursos (`GET /resources`) en una tabla con aforo, horario y
// estado; "Editar" abre `ResourceEditModal` con los cuatro campos que el
// contrato permite (`PATCH /resources/{id}`). Nombre, tipo, duración del
// bloque y `requiresApproval` son de solo lectura: su fuente de verdad es
// Terraform (ADR-0010). No hay alta ni baja de instalaciones.

import { useState } from 'react';
import { Badge, Button, DataTable, type DataTableColumn } from '@activa-club/ui';
import type { Resource } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import {
  RESOURCE_STATUS_BADGE_VARIANT,
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../../lib/format/resource';
import { useResourcesQuery } from '../../resources/resources-query';
import { toResourceLoadError } from './admin-resources-errors';
import { ResourceEditModal } from './ResourceEditModal';

const COLUMNS: ReadonlyArray<DataTableColumn<Resource>> = [
  {
    key: 'name',
    header: 'Instalación',
    render: (resource) => <span className="font-medium text-ink">{resource.name}</span>,
  },
  {
    key: 'type',
    header: 'Tipo',
    render: (resource) => RESOURCE_TYPE_LABEL[resource.type],
  },
  {
    key: 'capacity',
    header: 'Aforo',
    render: (resource) => `${resource.capacity} personas`,
  },
  {
    key: 'hours',
    header: 'Horario',
    render: (resource) => `${resource.opensAt} – ${resource.closesAt}`,
  },
  {
    key: 'block',
    header: 'Duración del bloque',
    render: (resource) => formatBlockDuration(resource.blockMinutes),
  },
  {
    key: 'approval',
    header: 'Requiere aprobación',
    render: (resource) => (resource.requiresApproval ? 'Sí' : 'No'),
  },
  {
    key: 'status',
    header: 'Estado',
    render: (resource) => (
      <Badge variant={RESOURCE_STATUS_BADGE_VARIANT[resource.resourceStatus]}>
        {RESOURCE_STATUS_LABEL[resource.resourceStatus]}
      </Badge>
    ),
  },
];

export function ResourceManagementSection() {
  const { signOut } = useAuth();
  const query = useResourcesQuery();
  // Copia de la instalación al abrir: si el servidor responde NOT_FOUND y la
  // lista se refresca, la ventana sigue abierta mostrando el error.
  const [editing, setEditing] = useState<Resource | null>(null);

  const resources = query.data ?? [];
  const loadError = query.isError ? toResourceLoadError(query.error) : null;

  return (
    <section aria-labelledby="resource-management-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="resource-management-heading" className="type-section-title text-ink">
          Instalaciones
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Ajusta el aforo, el horario y el estado de cada instalación. Los cambios se aplican de
          inmediato a las reservas nuevas.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface-brand-soft p-4 text-sm text-ink">
        <p className="font-semibold">Qué pasa con las reservas ya creadas</p>
        <p className="mt-1">
          Bajar el aforo o cambiar el horario <strong>no invalida las reservas ya creadas</strong>:
          solo limita las reservas nuevas. Si alguna reserva existente quedó fuera del nuevo
          horario, puedes cancelarla desde Reservas.
        </p>
      </div>

      <DataTable
        caption="Instalaciones del club"
        hideCaption
        columns={COLUMNS}
        rows={resources}
        getRowKey={(resource) => resource.resourceId}
        renderActions={(resource) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={`Editar ${resource.name}`}
            onClick={() => setEditing(resource)}
          >
            Editar
          </Button>
        )}
        isLoading={query.isPending}
        loadingLabel="Cargando instalaciones…"
        isError={loadError !== null}
        errorTitle="No pudimos cargar las instalaciones"
        errorDescription={loadError?.message}
        retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
        onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
        emptyTitle="No hay instalaciones en el catálogo"
        emptyDescription="Las instalaciones se definen en la infraestructura del club; aquí solo se ajustan."
      />

      {editing ? (
        <ResourceEditModal
          key={editing.resourceId}
          resource={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
