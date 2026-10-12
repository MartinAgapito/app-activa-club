// Cantidad de pendientes del inicio del administrador (US-071).
//
// Los listados son paginados por cursor y no devuelven un total
// (docs/api/contratos-api.md §4 y §7). Con una sola página cargada solo se
// conoce el número exacto cuando no hay más páginas; si las hay, el piso
// ("20 o más") es lo único que se puede afirmar. El total exacto llega con
// `GET /dashboard/admin` (US-057, US-059).

export interface PendingCount {
  /** Elementos conocidos (los de la primera página). */
  count: number;
  /** Hay más páginas: `count` es un mínimo, no un total. */
  hasMore: boolean;
}

/** "3" cuando el total es exacto, "20 o más" cuando hay más páginas. */
export function formatPendingCount({ count, hasMore }: PendingCount): string {
  return hasMore ? `${count} o más` : String(count);
}

/** Frase para lectores de pantalla: "1 solicitud", "20 o más solicitudes". */
export function describePendingCount(
  pending: PendingCount,
  singular: string,
  plural: string,
): string {
  const noun = !pending.hasMore && pending.count === 1 ? singular : plural;
  return `${formatPendingCount(pending)} ${noun}`;
}
