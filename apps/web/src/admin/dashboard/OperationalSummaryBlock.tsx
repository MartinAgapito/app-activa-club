// Resumen operativo del club (US-059): socios por estado, membresías por
// vencer, pagos y notificaciones del mes, con acceso a la pantalla donde se
// resuelve cada cifra. Todas salen de `GET /dashboard/admin`, así que el
// bloque tiene un único estado de carga/error. Solo lectura.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AdminDashboard, MemberStatus } from '@activa-club/shared-types';
import { Badge, Spinner, buttonVariants } from '@activa-club/ui';
import { MEMBERS_TABS } from '../members/members-tabs';
import { SUMMARY_LINKS } from './summary-links';
import { DashboardSection } from './DashboardSection';
import { formatPeriodRange } from './dashboard-period';

const STATUS_ORDER: ReadonlyArray<MemberStatus> = [
  'ACTIVE',
  'MIGRATED',
  'APPROVED',
  'PENDING',
  'REJECTED',
];

const STATUS_HINT: Record<MemberStatus, string> = {
  ACTIVE: 'Cuenta activa',
  MIGRATED: 'Sin activar su cuenta',
  APPROVED: 'Falta el primer pago',
  PENDING: 'Esperan aprobación',
  REJECTED: 'Solicitud rechazada',
};

function statusLabel(status: MemberStatus): string {
  return MEMBERS_TABS.find((t) => t.status === status)?.label ?? status;
}

interface StatProps {
  label: string;
  value: number;
  hint?: string;
  to: string;
  linkLabel: string;
  /** Resalta la cifra con texto y color cuando es mayor que cero. */
  attention?: string;
}

function Stat({ label, value, hint, to, linkLabel, attention }: StatProps) {
  const highlighted = attention !== undefined && value > 0;
  return (
    <li
      className={
        highlighted
          ? 'flex flex-col gap-1 rounded-card border border-status-pending bg-status-pending-soft p-4'
          : 'flex flex-col gap-1 rounded-card border border-line bg-surface-card p-4'
      }
    >
      <span className="type-aux text-ink-muted">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="type-figure text-ink">{value}</span>
        {highlighted ? <Badge variant="warning">{attention}</Badge> : null}
      </span>
      {hint ? <span className="type-aux text-ink-muted">{hint}</span> : null}
      <Link
        to={to}
        className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} mt-2 self-start`}
      >
        {linkLabel}
        <span className="sr-only">: {label}</span>
      </Link>
    </li>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="type-card-title text-ink">{title}</h3>
        {note ? <p className="type-aux text-ink-muted">{note}</p> : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </div>
  );
}

interface OperationalSummaryBlockProps {
  data: AdminDashboard | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function OperationalSummaryBlock({
  data,
  isPending,
  isError,
  onRetry,
  onRefresh,
  isRefreshing = false,
}: OperationalSummaryBlockProps) {
  const refresh = (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
    >
      {isRefreshing ? 'Actualizando…' : 'Actualizar'}
    </button>
  );

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="flex justify-center py-6">
        <Spinner label="Cargando el resumen del club…" />
      </div>
    );
  } else if (isError || !data) {
    content = (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-card border border-danger-200 bg-danger-50 p-4"
      >
        <p className="font-medium text-danger-900">No pudimos cargar el resumen del club.</p>
        <p className="type-aux text-danger-700">
          Lo que espera tu decisión sigue disponible. Intenta nuevamente.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Reintentar
        </button>
      </div>
    );
  } else {
    const period = formatPeriodRange(data.periods.currentMonth);
    const counts = STATUS_ORDER.map((status) => ({
      status,
      count: data.membersByStatus[status] ?? 0,
    }));
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);

    content = (
      <div className="flex flex-col gap-6">
        <Group
          title="Socios por estado"
          note={`Total de socios: ${total}. Cifras al momento de la consulta.`}
        >
          {counts.map(({ status, count }) => (
            <Stat
              key={status}
              label={statusLabel(status)}
              value={count}
              hint={STATUS_HINT[status]}
              to={SUMMARY_LINKS.membersByStatus(status)}
              linkLabel="Ver socios"
            />
          ))}
          <Stat
            label="Membresías por vencer"
            value={data.membershipsExpiringSoon}
            hint="Vencen pronto"
            to={SUMMARY_LINKS.expiringSoon}
            linkLabel="Ver por vencer"
          />
        </Group>

        <Group title="Pagos del mes" note={`Del ${period} (hora de Lima).`}>
          <Stat
            label="Pagos exitosos"
            value={data.payments.succeeded}
            to={SUMMARY_LINKS.paymentsSucceeded}
            linkLabel="Ver pagos"
          />
          <Stat
            label="Pagos fallidos"
            value={data.payments.failed}
            to={SUMMARY_LINKS.paymentsFailed}
            linkLabel="Ver pagos"
            attention="Requiere atención"
          />
        </Group>

        <Group title="Notificaciones del mes" note={`Del ${period} (hora de Lima).`}>
          <Stat
            label="Notificaciones enviadas"
            value={data.notificationsSent}
            to={SUMMARY_LINKS.notifications}
            linkLabel="Ver historial"
          />
        </Group>

        <p className="type-aux text-ink-muted">
          ¿Quieres ver la evolución de reservas y la ocupación?{' '}
          <Link
            to={SUMMARY_LINKS.analytics}
            className="focus-ring font-semibold text-action underline"
          >
            Ir a Analítica
          </Link>
        </p>
      </div>
    );
  }

  return (
    <DashboardSection
      title="Resumen del club"
      description="Cifras clave con acceso directo a la pantalla donde se resuelven."
      action={refresh}
    >
      {content}
    </DashboardSection>
  );
}
