// Bloques del inicio del administrador (US-071): cada uno con sus estados.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { AttentionBlock } from './AttentionBlock';
import { PendingReservationsBlock } from './PendingReservationsBlock';
import { QuickAccessBlock } from './QuickAccessBlock';
import type { PendingSummary } from './pending-summaries';

function summary<T>(overrides: Partial<PendingSummary<T>> = {}): PendingSummary<T> {
  return {
    isPending: false,
    isError: false,
    items: [],
    count: 0,
    hasMore: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function reservation(n: number): AdminReservationListItem {
  return {
    reservationId: `res-${n}`,
    resourceId: 'parrilla-1',
    resourceType: 'PARRILLA',
    holderMemberId: `m-${n}`,
    startsAt: '2026-07-20T15:00:00Z',
    endsAt: '2026-07-20T20:00:00Z',
    reservationStatus: 'PENDING_APPROVAL',
    participantCount: n + 2,
    guestCount: 0,
    requiresApproval: true,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    holder: { memberId: `m-${n}`, firstName: `Socio${n}`, lastName: 'Prueba' },
  };
}

const NOW = new Date('2026-07-10T12:00:00Z');

function inRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AttentionBlock', () => {
  it('muestra las cantidades con su enlace a cada pantalla', () => {
    inRouter(
      <AttentionBlock members={summary({ count: 2 })} reservations={summary({ count: 1 })} />,
    );
    const region = screen.getByRole('region', { name: 'Requiere tu atención' });
    expect(within(region).getByText('2 solicitudes')).toBeInTheDocument();
    expect(within(region).getByText('1 reserva')).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Ver solicitudes' })).toHaveAttribute(
      'href',
      '/admin/solicitudes',
    );
    expect(within(region).getByRole('link', { name: 'Ver reservas' })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
    expect(within(region).getAllByText('Pendiente')).toHaveLength(2);
  });

  it('con más páginas muestra "N o más", nunca un total', () => {
    inRouter(
      <AttentionBlock
        members={summary({ count: 20, hasMore: true })}
        reservations={summary({ count: 3 })}
      />,
    );
    expect(screen.getByText('20 o más solicitudes')).toBeInTheDocument();
    expect(screen.getByText('20 o más')).toBeInTheDocument();
  });

  it('sin pendientes muestra "Todo al día"', () => {
    inRouter(<AttentionBlock members={summary()} reservations={summary()} />);
    expect(screen.getAllByText('Todo al día')).toHaveLength(2);
    expect(screen.getByText(/no hay nada esperando tu decisión/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('una fila con error se reintenta sin afectar a la otra', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    inRouter(
      <AttentionBlock
        members={summary({ isError: true, refetch })}
        reservations={summary({ count: 4 })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar');
    expect(screen.getByText('4 reservas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('muestra carga por fila', () => {
    inRouter(
      <AttentionBlock
        members={summary({ isPending: true })}
        reservations={summary({ count: 1 })}
      />,
    );
    expect(screen.getByText(/Cargando: Solicitudes de socios nuevos/)).toBeInTheDocument();
    expect(screen.getByText('1 reserva')).toBeInTheDocument();
  });
});

describe('PendingReservationsBlock', () => {
  it('lista como máximo cinco reservas con titular, instalación, fecha/hora y personas', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map(reservation);
    inRouter(
      <PendingReservationsBlock
        summary={summary({ items, count: 7, hasMore: true })}
        resourceNames={new Map([['parrilla-1', 'Parrilla 1']])}
        now={NOW}
      />,
    );
    const table = screen.getByRole('table', { name: 'Reservas por aprobar' });
    // Encabezado + 5 filas.
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getByText('Socio1 Prueba')).toBeInTheDocument();
    expect(within(table).queryByText('Socio6 Prueba')).not.toBeInTheDocument();
    expect(within(table).getAllByText('Parrilla 1')).toHaveLength(5);
    expect(screen.getByText(/7 o más reservas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Revisar/ })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
  });

  it('marca como vencida una reserva cuyo inicio ya pasó', () => {
    inRouter(
      <PendingReservationsBlock
        summary={summary({ items: [reservation(1)], count: 1 })}
        resourceNames={new Map()}
        now={new Date('2026-07-25T12:00:00Z')}
      />,
    );
    expect(screen.getByText('Vencida sin decisión')).toBeInTheDocument();
    // Sin nombre de instalación usa el tipo.
    expect(screen.getByText('Parrillas')).toBeInTheDocument();
  });

  it('vacío: "Todo al día" en lugar de una tabla', () => {
    inRouter(<PendingReservationsBlock summary={summary()} resourceNames={new Map()} now={NOW} />);
    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('carga y error con reintento', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    const { rerender } = inRouter(
      <PendingReservationsBlock
        summary={summary({ isPending: true })}
        resourceNames={new Map()}
        now={NOW}
      />,
    );
    expect(screen.getByText('Cargando reservas por aprobar…')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PendingReservationsBlock
          summary={summary({ isError: true, refetch })}
          resourceNames={new Map()}
          now={NOW}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos cargar las reservas por aprobar',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('QuickAccessBlock', () => {
  it('ofrece los tres accesos con su destino', () => {
    inRouter(<QuickAccessBlock />);
    const region = screen.getByRole('region', { name: 'Accesos rápidos' });
    expect(within(region).getByRole('link', { name: /Solicitudes/ })).toHaveAttribute(
      'href',
      '/admin/solicitudes',
    );
    expect(within(region).getByRole('link', { name: /Reservas/ })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
    expect(within(region).getByRole('link', { name: /Recursos y mantenimiento/ })).toHaveAttribute(
      'href',
      '/admin/recursos',
    );
  });
});
