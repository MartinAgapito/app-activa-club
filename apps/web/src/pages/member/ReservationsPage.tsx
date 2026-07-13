import { Link } from 'react-router-dom';
import { Badge, Card, buttonVariants } from '@activa-club/ui';
import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ReservationsPage() {
  return (
    <UnderConstructionPage
      title="Reservas"
      description="Calendario de disponibilidad y reservas de fútbol, tenis, pádel, piscina, parrillas y salón social (RN-RES-01..12)."
      endpoints={[
        'GET /resources',
        'GET /resources/{resourceId}/availability',
        'POST /reservations',
        'GET /reservations',
        'POST /reservations/{reservationId}/cancel',
      ]}
    >
      <Card compact className="border-warning-200 bg-warning-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="danger">Ejemplo ilustrativo</Badge>
              <span className="text-xs text-slate-500">
                vista previa del bloqueo por deuda — se conecta a datos reales en Sprint 1
              </span>
            </div>
            <h2 className="text-sm font-semibold text-slate-900">
              Un socio con deuda o membresía vencida no puede reservar
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Cuando <code>canReserve</code> del dashboard del socio (
              <code>GET /dashboard/member</code>) es <code>false</code>, esta pantalla debe bloquear
              la creación de reservas y dirigir claramente a Pagos, en vez de permitir reservar
              (RN-PAG-06 / RN-RES-12).
            </p>
          </div>
        </div>
        <Link
          to="/socio/pagos"
          className={buttonVariants({ variant: 'positive', className: 'mt-4' })}
        >
          Ir a pagos para regularizar
        </Link>
      </Card>
    </UnderConstructionPage>
  );
}
