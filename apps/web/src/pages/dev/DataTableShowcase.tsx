// Muestra de DataTable (US-065) para la página interna de design system.
// Datos ficticios locales: no usa la API ni entidades de shared-types.

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, DataTable, type DataTableColumn } from '@activa-club/ui';

interface DemoRow {
  id: string;
  resource: string;
  date: string;
  status: 'Confirmada' | 'Pendiente' | 'Rechazada';
}

const ALL_ROWS: DemoRow[] = [
  { id: '1', resource: 'Cancha de tenis 1', date: '12 oct, 18:00', status: 'Confirmada' },
  { id: '2', resource: 'Piscina', date: '13 oct, 07:00', status: 'Pendiente' },
  { id: '3', resource: 'Cancha de pádel', date: '14 oct, 20:00', status: 'Rechazada' },
  { id: '4', resource: 'Sala de usos múltiples', date: '15 oct, 19:00', status: 'Confirmada' },
];

const STATUS_VARIANT = {
  Confirmada: 'positive',
  Pendiente: 'warning',
  Rechazada: 'danger',
} as const;

const COLUMNS: DataTableColumn<DemoRow>[] = [
  { key: 'resource', header: 'Recurso', accessor: 'resource' },
  { key: 'date', header: 'Fecha', accessor: 'date' },
  {
    key: 'status',
    header: 'Estado',
    render: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>,
  },
];

export function DataTableShowcase() {
  const [visible, setVisible] = useState(2);

  return (
    <Card>
      <CardHeader title="DataTable" description="Tabla desde 640 px; tarjetas por debajo." />
      <DataTable
        caption="Reservas de ejemplo"
        hideCaption
        columns={COLUMNS}
        rows={ALL_ROWS.slice(0, visible)}
        getRowKey={(row) => row.id}
        onRowClick={() => undefined}
        getRowLabel={(row) => `Ver detalle de ${row.resource}`}
        renderActions={() => (
          <Button size="sm" variant="ghost">
            Ver detalle
          </Button>
        )}
        hasMore={visible < ALL_ROWS.length}
        onLoadMore={() => setVisible((n) => n + 2)}
      />
    </Card>
  );
}
