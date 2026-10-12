// Reservas y aprobaciones — US-077 (rehace la interfaz de US-034 y US-036).
//
// Dos pestañas: "Por aprobar" (con contador) y "Todas". La pestaña activa, los
// filtros y la reserva abierta en el panel de detalle viven en la URL
// (`?tab=`, `?estado=`, `?instalacion=`, `?desde=`, `?hasta=`, `?reserva=`).
// Aprobar, rechazar (con motivo) y cancelar usan las mismas ventanas desde la
// tabla y desde el panel. Contrato: docs/api/contratos-api.md §7.

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { AllReservationsSection } from '../../admin/reservations/AllReservationsSection';
import { PendingReservationsInbox } from '../../admin/reservations/PendingReservationsInbox';
import { ReservationDetailDrawer } from '../../admin/reservations/ReservationDetailDrawer';
import { useAdminReservationsQuery } from '../../admin/reservations/admin-reservations-query';
import { useReservationDecisions } from '../../admin/reservations/useReservationDecisions';
import { useResourcesQuery } from '../../resources/resources-query';

const NOW_REFRESH_MS = 60_000;

const TAB_VALUES = ['pendientes', 'todas'] as const;
type AdminReservationsTab = (typeof TAB_VALUES)[number];

/** Reloj de la pantalla: se refresca cada minuto para que el marcador de
 * "vencida sin decisión" no quede viejo con la pantalla abierta. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ReservationsAdminPage() {
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const resourcesQuery = useResourcesQuery();
  const pendingQuery = useAdminReservationsQuery({ status: 'PENDING_APPROVAL' });

  // `pestana` es el nombre que usa la historia US-071 en sus enlaces.
  const requestedTab = params.get('tab') ?? params.get('pestana');
  const tab: AdminReservationsTab = TAB_VALUES.find((v) => v === requestedTab) ?? 'pendientes';
  const openReservationId = params.get('reserva');

  const resourceNames = useMemo(
    () =>
      new Map(
        (resourcesQuery.data ?? []).map(
          (resource) => [resource.resourceId, resource.name] as const,
        ),
      ),
    [resourcesQuery.data],
  );

  function openDetail(reservation: Pick<AdminReservationListItem, 'reservationId'>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('reserva', reservation.reservationId);
      return next;
    });
  }

  function closeDetail() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('reserva');
        return next;
      },
      { replace: true },
    );
  }

  function changeTab(next: string) {
    // Cada pestaña conserva solo su propio estado: se limpian filtros y panel.
    setParams(next === 'pendientes' ? {} : { tab: next }, { replace: true });
  }

  const decisions = useReservationDecisions({
    resourceNames,
    onDecided: (_kind, reservationId) => {
      if (reservationId === openReservationId) {
        closeDetail();
      }
    },
  });

  const pendingItems = pendingQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const pendingCount = pendingQuery.data ? pendingItems.length : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas y aprobaciones"
        description="Resuelve las solicitudes de parrillas y salón social, y consulta o cancela cualquier reserva del club."
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Vistas de reservas">
          <TabsTrigger
            value="pendientes"
            {...(pendingCount !== undefined && pendingCount > 0 && { count: pendingCount })}
          >
            Por aprobar
          </TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="pt-4">
          <PendingReservationsInbox
            query={pendingQuery}
            now={now}
            resourceNames={resourceNames}
            onOpen={openDetail}
            onApprove={(reservation) => decisions.request('approve', reservation)}
            onReject={(reservation) => decisions.request('reject', reservation)}
          />
        </TabsContent>
        <TabsContent value="todas" className="pt-4">
          <AllReservationsSection now={now} resourceNames={resourceNames} onOpen={openDetail} />
        </TabsContent>
      </Tabs>

      <ReservationDetailDrawer
        reservationId={openReservationId}
        now={now}
        resourceNames={resourceNames}
        onClose={closeDetail}
        onDecision={decisions.request}
      />
      {decisions.dialogs}
    </div>
  );
}
