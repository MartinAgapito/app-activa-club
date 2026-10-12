// Pestaña "Enviadas" de la consola de notificaciones (US-049, criterios 1, 6, 8).
//
// `GET /notifications/sent`: historial de la más reciente a la más antigua con
// "Cargar más" por cursor. Distingue visualmente los avisos manuales de los
// automáticos (Badge + texto). Abrir una fila muestra el detalle completo; el
// contrato ya trae el mensaje, por lo que no hay otra llamada.

import { useMemo, useState } from 'react';
import { Badge, DataTable, type DataTableColumn } from '@activa-club/ui';
import type { SentNotification } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { useSentNotificationsQuery } from '../../notifications/admin-notifications-query';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { useResourcesQuery } from '../../resources/resources-query';
import { ORIGIN_LABEL } from './notification-display';
import { toLoadError } from './notification-errors';
import { SentNotificationDrawer } from './SentNotificationDrawer';

export function SentNotificationsSection() {
  const { signOut } = useAuth();
  const query = useSentNotificationsQuery();
  const resourcesQuery = useResourcesQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const selected = rows.find((row) => row.notificationId === selectedId) ?? null;
  const resourceNames = useMemo(
    () => new Map((resourcesQuery.data ?? []).map((r) => [r.resourceId, r.name] as const)),
    [resourcesQuery.data],
  );
  const loadError = query.isError ? toLoadError(query.error) : null;

  const columns: DataTableColumn<SentNotification>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (row) => formatDateTimeInLima(row.createdAt),
    },
    {
      key: 'title',
      header: 'Título',
      render: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'recipients',
      header: 'Destinatarios',
      render: (row) => (row.recipientCount === null ? 'No disponible' : String(row.recipientCount)),
    },
    {
      key: 'origin',
      header: 'Origen',
      render: (row) => (
        <Badge variant={row.origin === 'MANUAL' ? 'info' : 'neutral'}>
          {ORIGIN_LABEL[row.origin]}
        </Badge>
      ),
    },
    {
      key: 'email',
      header: 'Correo',
      render: (row) => (row.alsoEmail ? 'Sí' : 'No'),
    },
  ];

  return (
    <section aria-label="Notificaciones enviadas" className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Avisos publicados por administradores y avisos automáticos del sistema, del más reciente al
        más antiguo. Las fechas son de Lima.
      </p>

      <DataTable
        caption="Notificaciones enviadas"
        hideCaption
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.notificationId}
        onRowClick={(row) => setSelectedId(row.notificationId)}
        getRowLabel={(row) => `Ver detalle de la notificación ${row.title}`}
        isLoading={query.isPending}
        loadingLabel="Cargando notificaciones enviadas…"
        isError={loadError !== null}
        errorTitle="No pudimos cargar las notificaciones enviadas"
        errorDescription={loadError?.message}
        onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
        retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
        emptyTitle="Aún no se ha enviado ninguna notificación"
        emptyDescription="Cuando publiques un aviso o el sistema envíe uno automático, aparecerá aquí."
        hasMore={Boolean(query.hasNextPage)}
        onLoadMore={() => void query.fetchNextPage()}
        isLoadingMore={query.isFetchingNextPage}
      />

      <SentNotificationDrawer
        notification={selected}
        resourceNames={resourceNames}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}
