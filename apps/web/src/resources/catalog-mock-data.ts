// Catálogo mock de instalaciones del club — Ola 1 del Sprint 3 (EP-04).
//
// US-028 carga los diez recursos como ítems de Terraform y los expone en
// `GET /resources` (docs/api/contratos-api.md §6). Mientras ese endpoint no
// esté desplegado (US-027/US-028 en curso en paralelo), este módulo reproduce
// EXACTAMENTE la tabla de recursos mock de
// `docs/scrum/historias/US-028-catalogo-recursos-club.md` ("Catálogo a
// cargar (RN-RES)"), para que el frontend construya el catálogo y el
// selector de franjas contra la forma real del contrato.
//
// Reconciliación pendiente cuando el backend esté listo (US-032): reemplazar
// `fetchResources`/`fetchResourceAvailability` de `./resources-client.ts` por
// llamadas reales con `apiRequest` (mismo patrón que
// `members/plans-client.ts`), sin tocar los tipos ni los componentes que los
// consumen — el tipo `Resource` ya está versionado en `@activa-club/shared-types`.

import type { Resource } from '@activa-club/shared-types';

/**
 * Uno de los diez recursos del club marcado en `MAINTENANCE` a propósito en
 * este mock, para poder demostrar en la interfaz el criterio 8 de US-028
 * ("un recurso en mantenimiento aparece en el catálogo marcado como tal, no
 * desaparece de la lista") sin depender de `PATCH /resources/{resourceId}`
 * (US-036, todavía no implementado). El resto se carga `AVAILABLE`, como
 * exige la historia.
 */
export const RESOURCE_CATALOG: Resource[] = [
  {
    resourceId: 'futbol-1',
    type: 'FUTBOL',
    name: 'Cancha de fútbol 1',
    capacity: 14,
    blockMinutes: 90,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'futbol-2',
    type: 'FUTBOL',
    name: 'Cancha de fútbol 2',
    capacity: 14,
    blockMinutes: 90,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'tenis-1',
    type: 'TENIS',
    name: 'Cancha de tenis 1',
    capacity: 4,
    blockMinutes: 60,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'tenis-2',
    type: 'TENIS',
    name: 'Cancha de tenis 2',
    capacity: 4,
    blockMinutes: 60,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'padel-1',
    type: 'PADEL',
    name: 'Cancha de pádel 1',
    capacity: 4,
    blockMinutes: 90,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'padel-2',
    type: 'PADEL',
    name: 'Cancha de pádel 2',
    capacity: 4,
    blockMinutes: 90,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'piscina-1',
    type: 'PISCINA',
    name: 'Piscina',
    capacity: 5,
    blockMinutes: 120,
    opensAt: '08:00',
    closesAt: '20:00',
    requiresApproval: false,
    // Ilustra el criterio 8 de US-028: sigue apareciendo en el catálogo.
    resourceStatus: 'MAINTENANCE',
  },
  {
    resourceId: 'parrilla-1',
    type: 'PARRILLA',
    name: 'Zona de parrillas 1',
    capacity: 12,
    blockMinutes: 300,
    opensAt: '10:00',
    closesAt: '22:00',
    requiresApproval: true,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'parrilla-2',
    type: 'PARRILLA',
    name: 'Zona de parrillas 2',
    capacity: 12,
    blockMinutes: 300,
    opensAt: '10:00',
    closesAt: '22:00',
    requiresApproval: true,
    resourceStatus: 'AVAILABLE',
  },
  {
    resourceId: 'salon-social',
    type: 'SALON_SOCIAL',
    name: 'Salón social',
    capacity: 30,
    blockMinutes: 240,
    opensAt: '10:00',
    closesAt: '22:00',
    requiresApproval: true,
    resourceStatus: 'AVAILABLE',
  },
];

/**
 * Franjas del día (por índice, empezando en 0 desde `opensAt`) marcadas como
 * ocupadas por otra reserva en el mock de disponibilidad, para poder
 * demostrar visualmente el estado `RESERVED` sin depender de `POST
 * /reservations` (US-030, todavía no implementado). Determinístico y sin
 * relación con reservas reales: es solo dato de demostración de Ola 1.
 */
export const MOCK_RESERVED_SLOT_INDEXES: Record<string, number[]> = {
  'futbol-1': [1, 4],
  'tenis-1': [0],
  'padel-1': [2],
  'parrilla-1': [0],
  'salon-social': [1],
};

/**
 * Franjas del día marcadas como bloqueadas por mantenimiento puntual (no
 * `resourceStatus=MAINTENANCE`, que ya cubre `piscina-1` arriba), para
 * demostrar una ventana acotada de mantenimiento (US-035) sin depender de
 * `POST /resources/{resourceId}/maintenance`.
 */
export const MOCK_MAINTENANCE_SLOT_INDEXES: Record<string, number[]> = {
  'futbol-2': [2, 3],
  'tenis-2': [5],
};
