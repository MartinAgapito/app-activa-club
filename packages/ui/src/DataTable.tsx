// Tabla de datos responsive de la design foundation de Activa Club (US-065).
//
// Un solo markup semántico (<table>) que se adapta solo con CSS:
// - >= 640px (`sm`): tabla real con encabezados `<th scope="col">`.
// - < 640px: cada fila se presenta como tarjeta apilada con pares
//   etiqueta/valor (la etiqueta sale de `data-label` vía `::before`), sin
//   desplazamiento horizontal de la página.
// Puramente presentacional: recibe los datos ya cargados y no conoce
// entidades de dominio ni llama a la API. La paginación por cursor
// (`{ items, nextCursor }`) se resuelve en el llamador: aquí solo se expone
// el pie "Cargar más".

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

export type DataTableAlign = 'left' | 'center' | 'right';

export interface DataTableColumn<T> {
  /** Identificador estable de la columna. */
  key: string;
  /** Encabezado de columna; también es la etiqueta en la vista de tarjeta. */
  header: string;
  /** Propiedad de la fila a mostrar. Alternativa simple a `render`. */
  accessor?: keyof T;
  /** Contenido de la celda. Tiene prioridad sobre `accessor`. */
  render?: (row: T, index: number) => ReactNode;
  /** Alineación del contenido en la vista de tabla (por defecto `left`). */
  align?: DataTableAlign;
  /** Ancho CSS de la columna en la vista de tabla (p. ej. `8rem`). */
  width?: string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: ReadonlyArray<T>;
  /** Clave estable de cada fila (p. ej. su id). */
  getRowKey: (row: T, index: number) => string;
  /** Nombre accesible de la tabla. Visible salvo que `hideCaption` sea true. */
  caption: string;
  hideCaption?: boolean;

  /** Acción principal de la fila: clic o Enter/Espacio con la fila enfocada. */
  onRowClick?: (row: T) => void;
  /** Etiqueta accesible de la acción principal de cada fila. */
  getRowLabel?: (row: T) => string;
  /** Celda de acciones, siempre última columna (a la derecha). */
  renderActions?: (row: T) => ReactNode;
  /** Encabezado de la columna de acciones (oculto visualmente). */
  actionsHeader?: string;

  isLoading?: boolean;
  loadingLabel?: string;
  isError?: boolean;
  errorTitle?: string;
  errorDescription?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;

  /** Hay más resultados (`nextCursor` presente). Oculta el pie si es false. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  loadMoreLabel?: string;

  className?: string;
}

const alignClasses: Record<DataTableAlign, string> = {
  left: 'sm:text-left',
  center: 'sm:text-center',
  right: 'sm:text-right',
};

function getCellContent<T>(column: DataTableColumn<T>, row: T, index: number): ReactNode {
  if (column.render) return column.render(row, index);
  if (column.accessor !== undefined) return row[column.accessor] as ReactNode;
  return null;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  hideCaption = false,
  onRowClick,
  getRowLabel,
  renderActions,
  actionsHeader = 'Acciones',
  isLoading = false,
  loadingLabel = 'Cargando…',
  isError = false,
  errorTitle,
  errorDescription,
  onRetry,
  retryLabel = 'Reintentar',
  emptyTitle = 'No hay resultados',
  emptyDescription,
  emptyAction,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  loadMoreLabel = 'Cargar más',
  className,
}: DataTableProps<T>) {
  const hasRows = rows.length > 0;
  const isBusy = isLoading || isLoadingMore;

  // Los estados reemplazan a la tabla: nunca se muestra una tabla vacía.
  let stateContent: ReactNode = null;
  if (isError && !hasRows) {
    stateContent = (
      <ErrorState
        {...(errorTitle !== undefined && { title: errorTitle })}
        {...(errorDescription !== undefined && { description: errorDescription })}
        {...(onRetry && {
          action: (
            <Button variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          ),
        })}
      />
    );
  } else if (isLoading && !hasRows) {
    stateContent = (
      <div className="flex justify-center rounded-card border border-line bg-surface-card px-6 py-12">
        <Spinner label={loadingLabel} size="lg" />
      </div>
    );
  } else if (!hasRows) {
    stateContent = (
      <EmptyState
        title={emptyTitle}
        {...(emptyDescription !== undefined && { description: emptyDescription })}
        {...(emptyAction !== undefined && { action: emptyAction })}
      />
    );
  }

  if (stateContent) {
    return (
      <div className={className} aria-busy={isBusy}>
        {hideCaption ? null : <p className="mb-3 type-card-title text-ink">{caption}</p>}
        {stateContent}
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    // Solo la fila misma: Enter/Espacio sobre un botón interno no la activa.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(row);
    }
  };

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <div className={className} aria-busy={isBusy}>
      <div className="overflow-hidden rounded-card border border-line bg-surface-card shadow-card max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
        <table className="w-full border-collapse text-left text-sm text-ink max-sm:block">
          <caption
            className={cn(
              'px-4 py-3 text-left type-card-title text-ink max-sm:px-0',
              hideCaption && 'sr-only',
            )}
          >
            {caption}
          </caption>
          <thead className="max-sm:sr-only">
            <tr className="border-b border-line bg-surface-raised">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'px-4 py-3 type-aux font-semibold text-ink-muted',
                    alignClasses[column.align ?? 'left'],
                  )}
                >
                  {column.header}
                </th>
              ))}
              {renderActions ? (
                <th scope="col" className="px-4 py-3 sm:text-right">
                  <span className="sr-only">{actionsHeader}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="max-sm:block max-sm:space-y-3">
            {rows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                {...(onRowClick && {
                  tabIndex: 0,
                  onClick: () => onRowClick(row),
                  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) =>
                    handleKeyDown(event, row),
                  ...(getRowLabel && { 'aria-label': getRowLabel(row) }),
                })}
                className={cn(
                  'border-b border-line last:border-b-0',
                  'max-sm:block max-sm:rounded-card max-sm:border max-sm:bg-surface-card max-sm:p-4 max-sm:shadow-card',
                  onRowClick &&
                    'cursor-pointer transition-colors hover:bg-surface-brand-soft focus-ring',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.header}
                    className={cn(
                      'px-4 py-3 align-middle',
                      alignClasses[column.align ?? 'left'],
                      // Tarjeta: etiqueta a la izquierda, valor a la derecha.
                      'max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-4 max-sm:px-0 max-sm:py-1.5 max-sm:text-right',
                      'max-sm:before:type-aux max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]',
                    )}
                  >
                    {getCellContent(column, row, index)}
                  </td>
                ))}
                {renderActions ? (
                  <td
                    onClick={stopPropagation}
                    className="px-4 py-3 align-middle sm:text-right max-sm:mt-2 max-sm:flex max-sm:justify-end max-sm:border-t max-sm:border-line max-sm:px-0 max-sm:pb-0 max-sm:pt-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {renderActions(row)}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && onLoadMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} isLoading={isLoadingMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
