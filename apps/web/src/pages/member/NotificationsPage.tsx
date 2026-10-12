// Mis notificaciones — bandeja interna del socio (US-041, EP-05).
//
// Tabla con pestañas "Todas" / "No leídas" (estado en `?tab=`), "Cargar más"
// por cursor y panel lateral con el detalle. Abrir una notificación la marca
// como leída de forma optimista (rollback + aviso solo si falla). Consume
// `GET /notifications` y `POST /notifications/{id}/read`.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
  type DataTableColumn,
} from '@activa-club/ui';
import type { InboxNotification } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { NotificationDetailPanel } from '../../notifications/NotificationDetailPanel';
import {
  NOTIFICATIONS_QUERY_KEY,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from '../../notifications/notifications-query';

const TAB_VALUES = ['todas', 'no-leidas'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return value !== null && (TAB_VALUES as readonly string[]).includes(value);
}

function toLoadErrorMessage(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    if (error.code === 'UNAUTHENTICATED') {
      return {
        message: 'Tu sesión expiró. Inicia sesión nuevamente para ver tus notificaciones.',
        sessionExpired: true,
      };
    }
    if (error.code === 'NETWORK_ERROR') {
      return {
        message: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
        sessionExpired: false,
      };
    }
  }
  return {
    message: 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
    sessionExpired: false,
  };
}

const columns: DataTableColumn<InboxNotification>[] = [
  {
    key: 'date',
    header: 'Fecha',
    render: (notification) => formatDateTimeInLima(notification.createdAt),
  },
  {
    key: 'title',
    header: 'Aviso',
    render: (notification) => (
      <span className={notification.readStatus === 'UNREAD' ? 'font-semibold' : undefined}>
        {notification.title}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    render: (notification) =>
      notification.readStatus === 'UNREAD' ? (
        <Badge variant="info">No leída</Badge>
      ) : (
        <Badge variant="neutral">Leída</Badge>
      ),
  },
];

export function NotificationsPage() {
  const { signOut } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: TabValue = isTabValue(tabParam) ? tabParam : 'todas';
  const unreadOnly = tab === 'no-leidas';

  const query = useNotificationsQuery(unreadOnly);
  const markRead = useMarkNotificationReadMutation();
  const [selected, setSelected] = useState<InboxNotification | null>(null);

  const notifications = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  // Estado más reciente de la notificación abierta (la caché la actualiza al
  // marcarla); si salió de la lista, se conserva la copia abierta.
  const openNotification = selected
    ? (notifications.find((item) => item.notificationId === selected.notificationId) ?? selected)
    : null;

  function changeTab(value: string) {
    if (!isTabValue(value)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  }

  function openNotificationPanel(notification: InboxNotification) {
    setSelected(notification);
    if (notification.readStatus === 'UNREAD') {
      markRead.mutate(notification.notificationId, {
        onError: () =>
          toast.error('No pudimos marcar la notificación como leída. Intenta de nuevo.'),
      });
    }
  }

  // Cursor inválido o vencido (400): la lista vuelve a la primera página.
  const cursorRejected =
    query.isError && query.error instanceof ApiRequestError && query.error.status === 400;
  useEffect(() => {
    if (cursorRejected) {
      void queryClient.resetQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    }
  }, [cursorRejected, queryClient]);

  const loadError = query.isError && !cursorRejected ? toLoadErrorMessage(query.error) : null;
  // Fallo al cargar otra página con datos ya visibles: aviso en línea.
  const pageError = loadError !== null && notifications.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notificaciones"
        description="Los avisos del club sobre tu cuenta, tus pagos y tus reservas."
        actions={
          <Button
            type="button"
            variant="secondary"
            isLoading={query.isRefetching && !query.isFetchingNextPage}
            onClick={() => void query.refetch()}
          >
            Actualizar
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Filtrar notificaciones">
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="no-leidas">No leídas</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <DataTable
            caption={unreadOnly ? 'Notificaciones no leídas' : 'Todas las notificaciones'}
            hideCaption
            columns={columns}
            rows={notifications}
            getRowKey={(notification) => notification.notificationId}
            onRowClick={openNotificationPanel}
            getRowLabel={(notification) =>
              `${notification.title}, ${formatDateTimeInLima(notification.createdAt)}, ${
                notification.readStatus === 'UNREAD' ? 'No leída' : 'Leída'
              }. Abrir notificación`
            }
            isLoading={query.isPending || cursorRejected}
            loadingLabel="Cargando tus notificaciones…"
            isError={loadError !== null && !pageError}
            errorTitle="No pudimos cargar tus notificaciones"
            errorDescription={loadError?.message}
            retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
            onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
            emptyTitle={
              unreadOnly ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'
            }
            emptyDescription={
              unreadOnly
                ? 'Estás al día. Las notificaciones ya leídas están en la pestaña Todas.'
                : 'Cuando el club te envíe un aviso, aparecerá aquí.'
            }
            hasMore={query.hasNextPage}
            onLoadMore={() => void query.fetchNextPage()}
            isLoadingMore={query.isFetchingNextPage}
          />
        </TabsContent>
      </Tabs>

      {pageError ? (
        <p role="alert" className="text-center text-sm text-status-problem">
          {loadError.message}
        </p>
      ) : null}

      <NotificationDetailPanel notification={openNotification} onClose={() => setSelected(null)} />
    </div>
  );
}
