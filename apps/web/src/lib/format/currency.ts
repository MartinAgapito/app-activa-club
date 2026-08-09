// Formato de montos monetarios en soles para pantallas orientadas a personas.
//
// El backend siempre entrega los montos en céntimos (entero), nunca en soles
// (docs/api/contratos-api.md §5, RN-PAG-01..03). Ninguna pantalla debe hacer
// esa conversión de forma ad-hoc ni mostrar el entero crudo: este módulo
// centraliza la traducción a la unidad correcta con el formato de moneda
// peruano.

import type { Currency } from '@activa-club/shared-types';

/** Convierte un monto en céntimos (como lo entrega el backend) a un texto
 * formateado como moneda peruana, p. ej. `12000` -> "S/ 120.00". */
export function formatCentsAsCurrency(amountInCents: number, currency: Currency): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(
    amountInCents / 100,
  );
}
