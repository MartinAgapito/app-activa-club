// Gráfico de columnas en CSS (US-060), sin librería de gráficos.
//
// Accesibilidad: el dibujo es una imagen con resumen textual (`role="img"`) y
// las mismas cifras están disponibles en una tabla nativa dentro de un
// `<details>`. La columna máxima no se distingue solo por color: se nombra en
// el resumen y, en series cortas, su valor se escribe sobre la columna.

import { useId } from 'react';
import { cn } from '@activa-club/ui';
import { findPeak } from './analytics-model';

export interface ColumnChartItem {
  key: string;
  /** Etiqueta completa (tabla y resumen). */
  label: string;
  /** Etiqueta corta bajo la columna; vacía para omitirla. */
  axisLabel: string;
  value: number;
}

interface ColumnChartProps {
  items: ColumnChartItem[];
  /** Encabezado de la columna de etiquetas de la tabla ("Día", "Hora"). */
  labelHeader: string;
  /** Encabezado de la columna de valores ("Reservas"). */
  valueHeader: string;
  /** Texto del resumen: "Día con más reservas" / "Hora con más reservas". */
  peakPrefix: string;
  /** Escribe el valor sobre cada columna (series cortas). */
  showValues?: boolean;
}

export function ColumnChart({
  items,
  labelHeader,
  valueHeader,
  peakPrefix,
  showValues = false,
}: ColumnChartProps) {
  const summaryId = useId();
  const { maxValue, maxLabels } = findPeak(items);
  const summary =
    maxValue > 0
      ? `${peakPrefix}: ${maxLabels.join(', ')} (${maxValue}).`
      : 'Sin reservas en este periodo.';

  return (
    <div className="flex flex-col gap-3">
      <p id={summaryId} className="type-aux text-ink-muted">
        {summary}
      </p>
      <div
        role="img"
        aria-labelledby={summaryId}
        className="flex h-44 items-end gap-px border-b border-line sm:gap-1"
      >
        {items.map((item) => {
          const isPeak = maxValue > 0 && item.value === maxValue;
          const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div
              key={item.key}
              data-testid="chart-column"
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {showValues ? (
                <span className={cn('text-[0.65rem] leading-4', isPeak && 'font-bold text-ink')}>
                  {item.value}
                </span>
              ) : null}
              <div
                className={cn('w-full rounded-t-sm', isPeak ? 'bg-brand-700' : 'bg-brand-300')}
                style={{ height: `${height}%`, minHeight: item.value > 0 ? '2px' : '0' }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-px text-[0.65rem] text-ink-muted sm:gap-1">
        {items.map((item) => (
          <span key={item.key} className="min-w-0 flex-1 overflow-visible text-center">
            {item.axisLabel}
          </span>
        ))}
      </div>
      <details className="rounded-card border border-line bg-surface-raised p-3">
        <summary className="cursor-pointer type-aux font-medium text-ink">
          Ver los datos en tabla
        </summary>
        <div
          role="region"
          aria-label={`Tabla de ${valueHeader.toLowerCase()} por ${labelHeader.toLowerCase()}`}
          tabIndex={0}
          className="mt-3 max-h-72 overflow-auto"
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              {valueHeader} por {labelHeader.toLowerCase()}
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-1 pr-4 font-medium">
                  {labelHeader}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 pr-4 font-normal">
                    {item.label}
                  </th>
                  <td className="py-1 text-right tabular-nums">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
