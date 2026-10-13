import { Link } from 'react-router-dom';
import { Info, TriangleAlert } from 'lucide-react';
import { buttonVariants } from '@activa-club/ui';
import type { MemberDashboard } from '@activa-club/shared-types';
import { ALERT_CODE, reservationBlockedReason } from './member-dashboard-view';

/** Aviso destacado del inicio. Con `canReserve=false` explica el motivo y
 * ofrece pagar o renovar (RN-PAG-06 / RN-RES-12); con `canReserve=true` y
 * alertas (p. ej. membresía por vencer) es informativo. Muestra el `message`
 * del servidor, nunca el código. Sin nada que avisar no renderiza. */
export function ReservationBlockNotice({ dashboard }: { dashboard: MemberDashboard }) {
  const { canReserve, alerts } = dashboard;

  if (!canReserve) {
    const messages =
      alerts.length > 0
        ? alerts.map((alert) => alert.message)
        : [reservationBlockedReason(dashboard)];
    return (
      <section
        aria-labelledby="aviso-bloqueo-titulo"
        className="flex flex-col gap-3 rounded-card border border-danger-200 bg-status-problem-soft p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-problem" aria-hidden />
          <div>
            <h2 id="aviso-bloqueo-titulo" className="type-card-title text-status-problem">
              No puedes reservar por ahora
            </h2>
            <ul className="flex flex-col gap-1">
              {messages.map((message) => (
                <li key={message} className="type-body text-ink">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Link
          to="/socio/membresia"
          className={buttonVariants({ variant: 'danger', className: 'shrink-0' })}
        >
          Pagar o renovar membresía
        </Link>
      </section>
    );
  }

  if (alerts.length === 0) return null;

  const renewal = alerts.some((alert) => alert.code === ALERT_CODE.RENEWAL_DUE);
  return (
    <section
      aria-labelledby="aviso-vencimiento-titulo"
      className="flex flex-col gap-3 rounded-card border border-warning-200 bg-status-pending-soft p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-status-pending" aria-hidden />
        <div>
          <h2 id="aviso-vencimiento-titulo" className="type-card-title text-status-pending">
            {renewal ? 'Tu membresía vence pronto' : 'Aviso sobre tu membresía'}
          </h2>
          <ul className="flex flex-col gap-1">
            {alerts.map((alert) => (
              <li key={alert.code} className="type-body text-ink">
                {alert.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        to="/socio/membresia"
        className={buttonVariants({ variant: 'secondary', className: 'shrink-0' })}
      >
        Renovar membresía
      </Link>
    </section>
  );
}
