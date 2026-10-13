// Ocupación por instalación (US-060): porcentaje escrito, barra de apoyo y las
// horas que explican la proporción (reservadas / operativas).

import { DataTable, type DataTableColumn } from '@activa-club/ui';
import { formatHours, formatPercent, type OccupancyRow } from './analytics-model';

const COLUMNS: DataTableColumn<OccupancyRow>[] = [
  { key: 'name', header: 'Instalación', render: (row) => row.name },
  {
    key: 'rate',
    header: 'Ocupación',
    render: (row) => (
      <span className="flex items-center gap-2">
        <span className="w-14 font-semibold tabular-nums">{formatPercent(row.occupancyRate)}</span>
        <span aria-hidden="true" className="h-2 w-24 rounded-full bg-brand-50">
          <span
            className="block h-2 rounded-full bg-positive-600"
            style={{ width: `${Math.min(Math.max(row.occupancyRate, 0), 1) * 100}%` }}
          />
        </span>
      </span>
    ),
  },
  {
    key: 'reserved',
    header: 'Horas reservadas',
    align: 'right',
    render: (row) => formatHours(row.reservedHours),
  },
  {
    key: 'operating',
    header: 'Horas operativas',
    align: 'right',
    render: (row) => formatHours(row.operatingHours),
  },
];

export function OccupancyTable({ rows }: { rows: OccupancyRow[] }) {
  return (
    <DataTable
      caption="Ocupación por instalación"
      hideCaption
      columns={COLUMNS}
      rows={rows}
      getRowKey={(row) => row.resourceId}
    />
  );
}
