// Bloque "Reservas por aprobar" (US-071): las más próximas (hasta 5) en una
// DataTable, con acceso a la bandeja donde se decide. Solo lectura.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DataTable, buttonVariants, type DataTableColumn } from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import { holderName, isOverduePending } from '../reservations/reservation-display';
import { DashboardSection } from './DashboardSection';
import { describePendingCount } from './pending-count';
import type { PendingSummary } from './pending-summaries';

export const DASHBOARD_RESERVATIONS_LIMIT = 5;

interface PendingReservationsBlockProps {
  summary: PendingSummary<AdminReservationListItem>;
  /** `resourceId` -> nombre de la instalación. */
  resourceNames: ReadonlyMap<string, string>;
  now: Date;
}

export function PendingReservationsBlock({
  summary,
  resourceNames,
  now,
}: PendingReservationsBlockProps) {
  const rows = summary.items.slice(0, DASHBOARD_RESERVATIONS_LIMIT);
  const hasData = !summary.isPending && !summary.isError && summary.count > 0;

  const columns = useMemo<DataTableColumn<AdminReservationListItem>[]>(
    () => [
      { key: 'holder', header: 'Titular', render: (row) => holderName(row) },
      {
        key: 'resource',
        header: 'Instalación',
        render: (row) => resourceNames.get(row.resourceId) ?? RESOURCE_TYPE_LABEL[row.resourceType],
      },
      {
        key: 'when',
        header: 'Fecha y hora',
        render: (row) => (
          <span className="flex flex-wrap items-center gap-2 max-sm:justify-end">
            <span>
              {formatDateInLima(row.startsAt)},{' '}
              <span className="font-display font-semibold tabular-nums">
                {formatTimeRangeInLima(row.startsAt, row.endsAt)}
              </span>
            </span>
            {isOverduePending(row, now) ? (
              <Badge variant="danger">Vencida sin decisión</Badge>
            ) : null}
          </span>
        ),
      },
      {
        key: 'people',
        header: 'Personas',
        align: 'right',
        render: (row) => (
          <span className="font-display font-semibold tabular-nums">{row.participantCount}</span>
        ),
      },
    ],
    [resourceNames, now],
  );

  return (
    <DashboardSection
      title="Reservas por aprobar"
      description={
        hasData
          ? `Las más próximas de ${describePendingCount(summary, 'reserva', 'reservas')}.`
          : 'Parrillas y salón social que esperan tu decisión.'
      }
      action={
        <Link to="/admin/reservas" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          Revisar
          <span className="sr-only"> reservas por aprobar</span>
        </Link>
      }
    >
      <DataTable
        caption="Reservas por aprobar"
        hideCaption
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.reservationId}
        isLoading={summary.isPending}
        loadingLabel="Cargando reservas por aprobar…"
        isError={summary.isError}
        errorTitle="No pudimos cargar las reservas por aprobar"
        errorDescription="Intenta nuevamente en unos minutos."
        onRetry={summary.refetch}
        emptyTitle="Todo al día"
        emptyDescription="No hay reservas esperando aprobación."
      />
    </DashboardSection>
  );
}
