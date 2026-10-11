// Reservas y aprobaciones — interfaz administrativa de US-034 (criterios 1 y
// 13) y US-036 (criterios 8 y 12).
//
// Dos vistas: la bandeja de solicitudes pendientes (por defecto, es lo que el
// administrador debe resolver) y la consulta de todas las reservas con
// filtros y cancelación administrativa. Contrato: docs/api/contratos-api.md §7.

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { PageHeader, cn } from '@activa-club/ui';
import { AllReservationsSection } from '../../admin/reservations/AllReservationsSection';
import { PendingReservationsInbox } from '../../admin/reservations/PendingReservationsInbox';
import { useResourcesQuery } from '../../resources/resources-query';

const NOW_REFRESH_MS = 60_000;

type AdminReservationsTab = 'pending' | 'all';

const TABS: { id: AdminReservationsTab; label: string }[] = [
  { id: 'pending', label: 'Pendientes de aprobación' },
  { id: 'all', label: 'Todas las reservas' },
];

/** Reloj de la pantalla: se refresca cada minuto para que el marcador de
 * "vencida sin decisión" no quede viejo con la pantalla abierta. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ReservationsAdminPage() {
  const [tab, setTab] = useState<AdminReservationsTab>('pending');
  const now = useNow();
  const resourcesQuery = useResourcesQuery();

  const resourceNames = useMemo(
    () =>
      new Map(
        (resourcesQuery.data ?? []).map(
          (resource) => [resource.resourceId, resource.name] as const,
        ),
      ),
    [resourcesQuery.data],
  );

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next: AdminReservationsTab = tab === 'pending' ? 'all' : 'pending';
      setTab(next);
      document.getElementById(`admin-reservations-tab-${next}`)?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas y aprobaciones"
        description="Resuelve las solicitudes de parrillas y salón social, y consulta o cancela cualquier reserva del club."
      />

      <div
        role="tablist"
        aria-label="Vistas de reservas"
        className="flex gap-2 border-b border-slate-200"
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              id={`admin-reservations-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`admin-reservations-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={handleTabKeyDown}
              className={cn(
                '-mb-px min-h-11 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                selected
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`admin-reservations-panel-${tab}`}
        aria-labelledby={`admin-reservations-tab-${tab}`}
      >
        {tab === 'pending' ? (
          <PendingReservationsInbox now={now} resourceNames={resourceNames} />
        ) : (
          <AllReservationsSection now={now} resourceNames={resourceNames} />
        )}
      </div>
    </div>
  );
}
