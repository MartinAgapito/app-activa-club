// Fixture de prueba del flujo de migración (US-009). Datos totalmente
// ficticios (NO representan socios reales) usados solo para validar el diseño
// de la transformación mientras `mock-data/` no tiene el JSON on-premise real
// (ver mock-data/README.md). El contrato de entrada es el de
// docs/data/mapeo-migracion.md §1.

import type { LegacyExport } from '@activa-club/shared-types';

/**
 * Cuatro socios ficticios cubriendo cada rama de `deriveMembershipStatus`
 * (docs/data/mapeo-migracion.md §3), asumiendo "hoy" = 2026-07-09 (America/Lima):
 * 0. ACTIVE (sin deuda, vence lejos)
 * 1. DEBT (saldo pendiente > 0, gana sobre cualquier fecha de vencimiento)
 * 2. EXPIRING_SOON (vence dentro de los próximos 7 días)
 * 3. EXPIRED (venció y no hay deuda)
 */
export const sampleLegacyExport: LegacyExport = {
  version: '1',
  exportedAt: '2026-07-01T00:00:00Z',
  socios: [
    {
      legacyId: 'SOC-TEST-001',
      dni: '10000001',
      nombres: 'Ana',
      apellidos: 'Torres Vega',
      email: 'ana.torres.fixture@example.com',
      telefono: '999000001',
      membresia: {
        tipo: 'ANNUAL',
        inicio: '2026-01-15',
        fin: '2027-01-15',
        estadoLegado: 'ACTIVA',
      },
      saldoPendiente: 0,
    },
    {
      legacyId: 'SOC-TEST-002',
      dni: '10000002',
      nombres: 'Luis',
      apellidos: 'Ramírez Paz',
      email: 'luis.ramirez.fixture@example.com',
      membresia: {
        tipo: 'MONTHLY',
        inicio: '2026-06-01',
        fin: '2027-06-01',
        estadoLegado: 'ACTIVA',
      },
      saldoPendiente: 5000,
    },
    {
      legacyId: 'SOC-TEST-003',
      dni: '10000003',
      nombres: 'Carla',
      apellidos: 'Núñez Solís',
      email: 'carla.nunez.fixture@example.com',
      membresia: {
        tipo: 'MONTHLY',
        inicio: '2026-06-09',
        fin: '2026-07-12',
        estadoLegado: 'ACTIVA',
      },
      saldoPendiente: 0,
    },
    {
      legacyId: 'SOC-TEST-004',
      dni: '10000004',
      nombres: 'Diego',
      apellidos: 'Flores Reyes',
      email: 'diego.flores.fixture@example.com',
      membresia: {
        tipo: 'MONTHLY',
        inicio: '2026-04-01',
        fin: '2026-06-01',
        estadoLegado: 'VENCIDA',
      },
      saldoPendiente: 0,
    },
  ],
};

/** Envoltura con un registro adicional inválido (sin `email`) para probar el rechazo por ítem. */
export const sampleLegacyExportWithInvalidItem = {
  version: '1',
  exportedAt: '2026-07-01T00:00:00Z',
  socios: [
    ...sampleLegacyExport.socios,
    {
      legacyId: 'SOC-TEST-005',
      dni: '10000005',
      nombres: 'Sin Email',
      apellidos: 'Fixture',
      membresia: {
        tipo: 'MONTHLY',
        inicio: '2026-06-01',
        fin: '2026-07-01',
        estadoLegado: 'ACTIVA',
      },
      saldoPendiente: 0,
    },
  ],
};
