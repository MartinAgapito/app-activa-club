// Reservas por instalación (US-060): lista ordenada de mayor a menor con el
// número escrito junto a cada barra. La lista (`<ol>`) es la alternativa
// textual: el nombre y la cifra siempre están como texto.

import type { ResourceCountRow } from './analytics-model';

export function ResourceBars({ rows }: { rows: ResourceCountRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <ol aria-label="Reservas por instalación, de mayor a menor" className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.resourceId} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 font-medium text-ink">{row.name}</span>
            <span className="shrink-0 tabular-nums text-ink">
              {row.count} {row.count === 1 ? 'reserva' : 'reservas'}
            </span>
          </div>
          <div aria-hidden="true" className="h-3 w-full rounded-full bg-brand-50">
            <div
              className="h-3 rounded-full bg-brand-600"
              style={{ width: max > 0 ? `${(row.count / max) * 100}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
