// Inicio del administrador — US-071 y US-059.
//
// Las cifras exactas (pendientes, socios por estado, pagos, notificaciones)
// salen de `GET /dashboard/admin` vía `useAdminDashboard`, que comparte caché
// con la analítica (US-060). La tabla de reservas por aprobar usa la lista
// admin `PENDING_APPROVAL`. Cada bloque falla y se reintenta por separado.

import { useMemo, useState } from 'react';
import { Button, PageHeader } from '@activa-club/ui';
import { AttentionBlock } from '../../admin/dashboard/AttentionBlock';
import { OperationalSummaryBlock } from '../../admin/dashboard/OperationalSummaryBlock';
import { PendingReservationsBlock } from '../../admin/dashboard/PendingReservationsBlock';
import { QuickAccessBlock } from '../../admin/dashboard/QuickAccessBlock';
import {
  summaryFromCount,
  usePendingReservationsSummary,
} from '../../admin/dashboard/pending-summaries';
import { useAdminDashboard } from '../../admin/dashboard/useAdminDashboard';
import { useResourcesQuery } from '../../resources/resources-query';

export function AdminDashboardPage() {
  const dashboard = useAdminDashboard();
  const reservations = usePendingReservationsSummary();
  const resourcesQuery = useResourcesQuery();
  // Instante de referencia de la visita (para marcar reservas vencidas).
  const [now] = useState(() => new Date());

  const members = summaryFromCount(dashboard, dashboard.data?.membersByStatus.PENDING);
  const approvals = summaryFromCount(dashboard, dashboard.data?.pendingApprovals);

  const resourceNames = useMemo(
    () => new Map((resourcesQuery.data ?? []).map((r) => [r.resourceId, r.name] as const)),
    [resourcesQuery.data],
  );

  function refreshAll() {
    void dashboard.refetch();
    reservations.refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel de administración"
        description="Lo que espera tu decisión, las cifras del club y los accesos a las tareas frecuentes."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={refreshAll}>
            Actualizar todo
          </Button>
        }
      />
      <AttentionBlock members={members} reservations={approvals} />
      <OperationalSummaryBlock
        data={dashboard.data}
        isPending={dashboard.isPending}
        isError={dashboard.isError && !dashboard.data}
        onRetry={() => void dashboard.refetch()}
        onRefresh={() => void dashboard.refetch()}
        isRefreshing={dashboard.isFetching && !dashboard.isPending}
      />
      <PendingReservationsBlock summary={reservations} resourceNames={resourceNames} now={now} />
      <QuickAccessBlock />
    </div>
  );
}
