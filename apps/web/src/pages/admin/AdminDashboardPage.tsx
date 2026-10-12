// Inicio del administrador — US-071.
//
// Orientado a la acción con los endpoints existentes (`GET /members?status=
// PENDING` y `GET /reservations?scope=all&status=PENDING_APPROVAL`). Cada
// bloque es independiente (carga, falla y se reintenta por separado) y recibe
// su dato por props: US-059 solo cambiará la fuente en
// `admin/dashboard/pending-summaries.ts`.

import { useMemo, useState } from 'react';
import { PageHeader } from '@activa-club/ui';
import { AttentionBlock } from '../../admin/dashboard/AttentionBlock';
import { PendingReservationsBlock } from '../../admin/dashboard/PendingReservationsBlock';
import { QuickAccessBlock } from '../../admin/dashboard/QuickAccessBlock';
import {
  usePendingMembersSummary,
  usePendingReservationsSummary,
} from '../../admin/dashboard/pending-summaries';
import { useResourcesQuery } from '../../resources/resources-query';

export function AdminDashboardPage() {
  const members = usePendingMembersSummary();
  const reservations = usePendingReservationsSummary();
  const resourcesQuery = useResourcesQuery();
  // Instante de referencia de la visita (para marcar reservas vencidas).
  const [now] = useState(() => new Date());

  const resourceNames = useMemo(
    () => new Map((resourcesQuery.data ?? []).map((r) => [r.resourceId, r.name] as const)),
    [resourcesQuery.data],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel de administración"
        description="Lo que espera tu decisión y los accesos a las tareas frecuentes del club."
      />
      <AttentionBlock members={members} reservations={reservations} />
      <PendingReservationsBlock summary={reservations} resourceNames={resourceNames} now={now} />
      <QuickAccessBlock />
    </div>
  );
}
