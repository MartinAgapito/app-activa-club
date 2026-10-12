// Bloque "Requiere tu atención" (US-071): una fila por tipo de pendiente con
// su cantidad y el enlace a la pantalla donde se decide. Cada fila carga,
// falla y se reintenta de forma independiente. Solo lectura.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Spinner, buttonVariants } from '@activa-club/ui';
import { DashboardSection } from './DashboardSection';
import { describePendingCount, formatPendingCount } from './pending-count';
import type { PendingSummary } from './pending-summaries';

interface AttentionRowProps {
  label: string;
  singular: string;
  plural: string;
  to: string;
  linkLabel: string;
  summary: PendingSummary<unknown>;
}

function AttentionRow({ label, singular, plural, to, linkLabel, summary }: AttentionRowProps) {
  let content: ReactNode;
  if (summary.isPending) {
    content = <Spinner label={`Cargando: ${label}…`} />;
  } else if (summary.isError) {
    content = (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <span className="type-aux text-status-problem">No pudimos cargar esta información.</span>
        <button
          type="button"
          onClick={summary.refetch}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        >
          Reintentar
          <span className="sr-only">: {label}</span>
        </button>
      </div>
    );
  } else if (summary.count === 0) {
    content = (
      <p className="type-body text-ink-muted">
        <span className="font-semibold text-status-confirmed">Todo al día</span> · Sin pendientes
      </p>
    );
  } else {
    const described = describePendingCount(summary, singular, plural);
    content = (
      <div className="flex flex-wrap items-center gap-3">
        <span className="type-figure text-ink">
          <span aria-hidden="true">{formatPendingCount(summary)}</span>
          <span className="sr-only">{described}</span>
        </span>
        <Badge variant="warning">Pendiente</Badge>
        <Link to={to} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {linkLabel}
        </Link>
      </div>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="type-card-title text-ink">{label}</span>
      <div>{content}</div>
    </li>
  );
}

interface AttentionBlockProps {
  members: PendingSummary<unknown>;
  reservations: PendingSummary<unknown>;
}

export function AttentionBlock({ members, reservations }: AttentionBlockProps) {
  const isClear = (summary: PendingSummary<unknown>) =>
    !summary.isPending && !summary.isError && summary.count === 0;
  const allClear = isClear(members) && isClear(reservations);

  return (
    <DashboardSection
      title="Requiere tu atención"
      description={
        allClear
          ? 'Todo al día: no hay nada esperando tu decisión.'
          : 'Pendientes que esperan una decisión del administrador.'
      }
    >
      <ul className="divide-y divide-line">
        <AttentionRow
          label="Solicitudes de socios nuevos"
          singular="solicitud"
          plural="solicitudes"
          to="/admin/solicitudes"
          linkLabel="Ver solicitudes"
          summary={members}
        />
        <AttentionRow
          label="Reservas por aprobar"
          singular="reserva"
          plural="reservas"
          to="/admin/reservas"
          linkLabel="Ver reservas"
          summary={reservations}
        />
      </ul>
    </DashboardSection>
  );
}
