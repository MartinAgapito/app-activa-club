// Analítica de reservas y ocupación del administrador (US-060).
//
// Solo lectura sobre `GET /dashboard/admin`, periodo fijo `last30Days`
// (el contrato no admite elegir periodo). Estados: carga, error, vacío y éxito.

import { useMemo } from 'react';
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from '@activa-club/ui';
import { DashboardSection } from '../admin/dashboard/DashboardSection';
import { useResourcesQuery } from '../resources/resources-query';
import { useAdminDashboard } from './admin-dashboard-query';
import {
  buildOccupancyRows,
  buildResourceRows,
  formatDayShort,
  formatPeriodRange,
  totalReservations,
} from './analytics-model';
import { ColumnChart, type ColumnChartItem } from './ColumnChart';
import { OccupancyTable } from './OccupancyTable';
import { ResourceBars } from './ResourceBars';

export function AnalyticsView() {
  const dashboard = useAdminDashboard();
  const resources = useResourcesQuery();

  const names = useMemo(
    () => new Map((resources.data ?? []).map((r) => [r.resourceId, r.name] as const)),
    [resources.data],
  );

  const header = (
    <PageHeader
      title="Analítica de reservas y ocupación"
      description="Qué instalaciones y horarios se usan más y cuáles menos, para decidir horarios y mantenimientos."
    />
  );

  // El catálogo solo aporta nombres: si falla, se muestran con su código.
  if (dashboard.isPending || resources.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex justify-center py-12">
          <Spinner label="Cargando la analítica" size="lg" />
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState
          title="No pudimos cargar la analítica"
          description="Ocurrió un problema al consultar las métricas. Intenta nuevamente."
          action={
            <Button variant="secondary" onClick={() => void dashboard.refetch()}>
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }

  const data = dashboard.data;
  const total = totalReservations(data);
  const periodBanner = (
    <p className="rounded-card border border-brand-100 bg-surface-brand-soft px-4 py-3 text-sm text-ink">
      <span className="font-semibold">Periodo:</span> {formatPeriodRange(data.periods.last30Days)}{' '}
      (últimos 30 días, hora de Lima).
    </p>
  );

  if (total === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {periodBanner}
        <EmptyState
          title="Todavía no hay reservas en el período"
          description="Cuando los socios reserven, aquí verás el uso por instalación, por día y por horario."
        />
      </div>
    );
  }

  const dayItems: ColumnChartItem[] = data.reservationsByDay.map((entry, index, all) => ({
    key: entry.date,
    label: formatDayShort(entry.date),
    axisLabel:
      index === 0 || index === all.length - 1 || index === Math.floor(all.length / 2)
        ? formatDayShort(entry.date)
        : '',
    value: entry.count,
  }));
  const hourItems: ColumnChartItem[] = data.reservationsByHour.map((entry) => ({
    key: entry.hour,
    label: entry.hour,
    axisLabel: entry.hour.slice(0, 2),
    value: entry.count,
  }));

  return (
    <div className="flex flex-col gap-6">
      {header}
      {periodBanner}
      <p className="text-sm text-ink-muted">
        Reservas activas (confirmadas, por aprobar o aprobadas) cuyo inicio cae en el periodo:{' '}
        <strong className="text-ink">{total}</strong>.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection
          title="Reservas por instalación"
          description="De la más a la menos reservada."
        >
          <ResourceBars rows={buildResourceRows(data.reservationsByResource, names)} />
        </DashboardSection>
        <DashboardSection
          title="Ocupación por instalación"
          description="Horas reservadas sobre horas operativas, sin contar mantenimientos."
        >
          <OccupancyTable rows={buildOccupancyRows(data.occupancy, names)} />
        </DashboardSection>
      </div>
      <DashboardSection
        title="Reservas por día"
        description="Según el día de inicio de la reserva."
      >
        <ColumnChart
          items={dayItems}
          labelHeader="Día"
          valueHeader="Reservas"
          peakPrefix="Día con más reservas"
        />
      </DashboardSection>
      <DashboardSection
        title="Reservas por horario"
        description="Total del periodo según la hora de inicio."
      >
        <ColumnChart
          items={hourItems}
          labelHeader="Hora"
          valueHeader="Reservas"
          peakPrefix="Hora con más reservas"
          showValues
        />
      </DashboardSection>
    </div>
  );
}
