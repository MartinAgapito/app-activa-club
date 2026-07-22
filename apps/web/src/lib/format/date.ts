// Formato de fechas en español para pantallas orientadas a personas.
//
// El backend siempre entrega fechas en ISO-8601 UTC (docs/api/contratos-api.md
// §1). Ninguna pantalla debe mostrar ese formato crudo a un socio o
// administrador: este módulo centraliza la traducción a un formato legible.

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(iso));
}
