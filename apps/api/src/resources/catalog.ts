// Identificadores del catálogo fijo de instalaciones del club (ADR-0010).
//
// `Resource` no tiene índice propio para listarse sin `Scan`, y los procesos
// programados (p. ej. US-046) necesitan recorrer los recursos sin escanear la
// tabla. Los diez `resourceId` son fijos y los define
// `infrastructure/terraform/modules/resource-catalog/main.tf` (`local.catalog`);
// esta lista debe mantenerse sincronizada con ese archivo (la prueba de
// `catalog.test.ts` lo verifica contra el archivo de Terraform).

export const CATALOG_RESOURCE_IDS: readonly string[] = [
  'futbol-1',
  'futbol-2',
  'tenis-1',
  'tenis-2',
  'padel-1',
  'padel-2',
  'piscina-1',
  'parrilla-1',
  'parrilla-2',
  'salon-social',
];
