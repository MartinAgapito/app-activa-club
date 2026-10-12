// Inicio del socio — US-070 (EP-08). Compone bloques independientes, cada uno
// con su propia fuente de datos, estados de carga/error/vacío y reintento.
// US-056 solo cambiará la fuente del bloque de membresía a
// `GET /dashboard/member` y sumará los bloques de avisos y pagos.
//
// Orden en móvil: aviso, membresía, accesos, próximas reservas. En escritorio
// (lg) los accesos pasan a una columna lateral.

import { GreetingBlock } from '../../dashboard/GreetingBlock';
import { MembershipPassBlock } from '../../dashboard/MembershipPassBlock';
import { QuickActionsBlock } from '../../dashboard/QuickActionsBlock';
import { ReservationBlockNotice } from '../../dashboard/ReservationBlockNotice';
import { UpcomingReservationsBlock } from '../../dashboard/UpcomingReservationsBlock';

export function MemberDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <GreetingBlock />
      <ReservationBlockNotice />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MembershipPassBlock />
        </div>
        <div className="lg:row-span-2">
          <QuickActionsBlock />
        </div>
        <div className="lg:col-span-2">
          <UpcomingReservationsBlock />
        </div>
      </div>
    </div>
  );
}
