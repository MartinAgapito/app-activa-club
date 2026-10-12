import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Badge } from './Badge';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: '1', name: 'Cancha 1', status: 'Confirmada' },
  { id: '2', name: 'Cancha 2', status: 'Pendiente' },
  { id: '3', name: 'Piscina', status: 'Cancelada' },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Recurso', accessor: 'name' },
  {
    key: 'status',
    header: 'Estado',
    align: 'right',
    width: '8rem',
    render: (row) => <Badge>{row.status}</Badge>,
  },
];

type Props = ComponentProps<typeof DataTable<Row>>;

function build(props: Partial<Props> = {}) {
  return (
    <DataTable<Row>
      caption="Reservas"
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      {...props}
    />
  );
}

describe('DataTable', () => {
  it('renderiza encabezados con scope col y una fila por elemento', () => {
    render(build());
    const table = screen.getByRole('table', { name: 'Reservas' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Recurso', 'Estado']);
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    expect(within(table).getAllByRole('row')).toHaveLength(4); // encabezado + 3
    expect(screen.getByText('Piscina')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('expone la etiqueta de cada celda para la vista de tarjeta', () => {
    render(build());
    expect(screen.getByText('Cancha 1').closest('td')).toHaveAttribute('data-label', 'Recurso');
    expect(screen.getByText('Pendiente').closest('td')).toHaveAttribute('data-label', 'Estado');
  });

  it('oculta visualmente el caption cuando hideCaption es true', () => {
    render(build({ hideCaption: true }));
    expect(screen.getByText('Reservas')).toHaveClass('sr-only');
    expect(screen.getByRole('table', { name: 'Reservas' })).toBeInTheDocument();
  });

  it('agrega la columna de acciones a la derecha', () => {
    const onView = vi.fn();
    render(
      build({
        renderActions: (row) => (
          <button type="button" onClick={() => onView(row.id)}>
            Ver detalle {row.name}
          </button>
        ),
      }),
    );
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[2]).toHaveTextContent('Acciones');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle Piscina' }));
    expect(onView).toHaveBeenCalledWith('3');
  });

  it('activa la acción de fila con clic, Enter y Espacio', () => {
    const onRowClick = vi.fn();
    render(build({ onRowClick, getRowLabel: (row) => `Abrir ${row.name}` }));
    const row = screen.getByRole('row', { name: 'Abrir Cancha 2' });
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it('los controles de la columna de acciones no disparan la acción de fila', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      build({
        onRowClick,
        renderActions: () => (
          <button type="button" onClick={onAction}>
            Cancelar
          </button>
        ),
      }),
    );
    const [button] = screen.getAllByRole('button', { name: 'Cancelar' });
    fireEvent.click(button!);
    fireEvent.keyDown(button!, { key: 'Enter' });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('sin onRowClick las filas no son enfocables', () => {
    render(build());
    screen.getAllByRole('row').forEach((row) => expect(row).not.toHaveAttribute('tabindex'));
  });

  it('muestra el spinner y aria-busy mientras carga sin filas', () => {
    const { container } = render(
      build({ rows: [], isLoading: true, loadingLabel: 'Cargando reservas' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando reservas');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  it('muestra el error con reintento', () => {
    const onRetry = vi.fn();
    render(build({ rows: [], isError: true, errorTitle: 'No se pudo cargar', onRetry }));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el estado vacío con el mensaje del llamador', () => {
    render(
      build({
        rows: [],
        emptyTitle: 'Aún no tienes reservas',
        emptyDescription: 'Reserva una cancha.',
      }),
    );
    expect(screen.getByText('Aún no tienes reservas')).toBeInTheDocument();
    expect(screen.getByText('Reserva una cancha.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('Cargar más aparece solo con hasMore y dispara onLoadMore', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(build({ hasMore: true, onLoadMore }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(build({ hasMore: false, onLoadMore }));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('deshabilita Cargar más y marca aria-busy mientras carga la siguiente página', () => {
    const { container } = render(
      build({ hasMore: true, onLoadMore: vi.fn(), isLoadingMore: true }),
    );
    expect(screen.getByRole('button', { name: /Cargar más/ })).toBeDisabled();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
