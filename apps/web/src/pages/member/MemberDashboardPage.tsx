// Inicio del socio — US-056 (sobre el rediseño de US-070, EP-08). Una única
// consulta, `GET /dashboard/member`, alimenta saludo, aviso, membresía,
// accesos, próximas reservas y avisos; los últimos pagos tienen su propio
// estado (`GET /payments?limit=3`) y no tumban al resto.
//
// Orden en móvil: aviso, membresía, accesos, reservas, avisos, pagos e
// instalaciones. En escritorio (lg) los accesos pasan a una columna lateral.

import { FacilityShortcutsBlock } from '../../dashboard/FacilityShortcutsBlock';
import { BlockError, BlockLoading } from '../../dashboard/BlockState';
import { GreetingBlock } from '../../dashboard/GreetingBlock';
import { useMemberDashboardQuery } from '../../dashboard/member-dashboard-query';
import { reservationBlockedReason } from '../../dashboard/member-dashboard-view';
import { MembershipPassBlock } from '../../dashboard/MembershipPassBlock';
import { QuickActionsBlock } from '../../dashboard/QuickActionsBlock';
import { RecentNotificationsBlock } from '../../dashboard/RecentNotificationsBlock';
import { RecentPaymentsBlock } from '../../dashboard/RecentPaymentsBlock';
import { ReservationBlockNotice } from '../../dashboard/ReservationBlockNotice';
import { UpcomingReservationsBlock } from '../../dashboard/UpcomingReservationsBlock';

export function MemberDashboardPage() {
  const query = useMemberDashboardQuery();
  const dashboard = query.data;

  if (!dashboard) {
    return (
      <div className="flex flex-col gap-6">
        <GreetingBlock />
        {query.isError ? (
          <>
            <BlockError
              title="No pudimos cargar tu inicio"
              description="Revisa tu conexión e intenta nuevamente. Mientras tanto, puedes usar los accesos."
              onRetry={() => void query.refetch()}
            />
            <QuickActionsBlock />
          </>
        ) : (
          <BlockLoading label="Cargando tu inicio…" />
        )}
      </div>
    );
  }

  const { canReserve } = dashboard;

  return (
    <div className="flex flex-col gap-6">
      <GreetingBlock firstName={dashboard.member.firstName} />
      <ReservationBlockNotice dashboard={dashboard} />
      <div className="grid grid-cols-1 gap-6 lg:grid-flow-dense lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MembershipPassBlock dashboard={dashboard} />
        </div>
        <div className="lg:col-start-3 lg:row-span-2">
          <QuickActionsBlock
            canReserve={canReserve}
            blockedReason={canReserve ? undefined : reservationBlockedReason(dashboard)}
          />
        </div>
        <div className="lg:col-span-2">
          <UpcomingReservationsBlock
            reservations={dashboard.upcomingReservations}
            canReserve={canReserve}
          />
        </div>
        <div className="lg:col-span-2">
          <RecentNotificationsBlock notifications={dashboard.recentNotifications} />
        </div>
        <div className="lg:col-span-2">
          <RecentPaymentsBlock />
        </div>
        <div className="lg:col-start-3">
          <FacilityShortcutsBlock canReserve={canReserve} />
        </div>
      </div>
    </div>
  );
}
