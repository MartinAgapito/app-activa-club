// Tabla de reservas de las vistas administrativas (US-077, criterios 2 y 3),
// sobre el DataTable de la librería: en móvil cada fila se vuelve tarjeta. La
// fila entera abre el panel de detalle; las acciones por fila son opcionales.

import type { ReactNode } from 'react';
import { Badge, DataTable, type DataTableColumn } from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import {
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';
import {
  formatRequestAge,
  holderName,
  isOverduePending,
  participantsSummary,
} from './reservation-display';

export type AdminReservationsTableVariant = 'pending' | 'all';

interface AdminReservationsTableProps {
  caption: string;
  variant: AdminReservationsTableVariant;
  rows: ReadonlyArray<AdminReservationListItem>;
  now: Date;
  resourceNames: ReadonlyMap<string, string>;
  onOpen: (reservation: AdminReservationListItem) => void;
  renderActions?: (reservation: AdminReservationListItem) => ReactNode;
  isLoading: boolean;
  loadingLabel: string;
  isError: boolean;
  errorTitle: string;
  errorDescription?: string | undefined;
  onRetry: () => void;
  retryLabel?: string | undefined;
  emptyTitle: string;
  emptyDescription: string;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export function AdminReservationsTable({
  caption,
  variant,
  rows,
  now,
  resourceNames,
  onOpen,
  renderActions,
  isLoading,
  loadingLabel,
  isError,
  errorTitle,
  errorDescription,
  onRetry,
  retryLabel,
  emptyTitle,
  emptyDescription,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: AdminReservationsTableProps) {
  const resourceLabel = (row: AdminReservationListItem) =>
    resourceNames.get(row.resourceId) ?? RESOURCE_TYPE_LABEL[row.resourceType];

  const columns: DataTableColumn<AdminReservationListItem>[] = [
    {
      key: 'holder',
      header: 'Titular',
      render: (row) => <span className="font-medium">{holderName(row)}</span>,
    },
    {
      key: 'resource',
      header: 'Instalación',
      render: (row) => resourceLabel(row),
    },
    {
      key: 'when',
      header: 'Fecha y hora',
      render: (row) => (
        <span className="flex flex-col gap-1 sm:items-start max-sm:items-end">
          <span>
            <span className="capitalize">{formatDateInLima(row.startsAt)}</span>,{' '}
            <span>{formatTimeRangeInLima(row.startsAt, row.endsAt)}</span>
          </span>
          {isOverduePending(row, now) ? <Badge variant="danger">Vencida sin decisión</Badge> : null}
        </span>
      ),
    },
    {
      key: 'people',
      header: 'Personas',
      render: (row) => participantsSummary(row),
    },
    variant === 'pending'
      ? {
          key: 'age',
          header: 'Solicitada',
          render: (row) => formatRequestAge(row.createdAt, now),
        }
      : {
          key: 'status',
          header: 'Estado',
          render: (row) => (
            <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[row.reservationStatus]}>
              {RESERVATION_STATUS_LABEL[row.reservationStatus]}
            </Badge>
          ),
        },
  ];

  return (
    <DataTable
      caption={caption}
      hideCaption
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.reservationId}
      onRowClick={onOpen}
      getRowLabel={(row) =>
        `Ver detalle de la reserva de ${holderName(row)}, ${resourceLabel(row)}`
      }
      {...(renderActions && { renderActions })}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      isError={isError}
      errorTitle={errorTitle}
      {...(errorDescription !== undefined && { errorDescription })}
      onRetry={onRetry}
      {...(retryLabel && { retryLabel })}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
