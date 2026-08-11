import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resource } from '@activa-club/shared-types';

const listResourcesMock = vi.fn();
vi.mock('../../resources/repository', () => ({
  listResources: listResourcesMock,
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./list');

const CATALOG: Resource[] = [
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
    // Criterio 8: un recurso en mantenimiento sigue en la lista.
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

function buildEvent(claims: Record<string, string>) {
  return buildCognitoProxyEvent({ path: '/resources', claims });
}

describe('GET /resources', () => {
  beforeEach(() => {
    listResourcesMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member ni admin', async () => {
    const result = await handler(buildEvent({ sub: 'no-role-sub', 'cognito:groups': '[]' }));

    expect(result.statusCode).toBe(403);
    expect(listResourcesMock).not.toHaveBeenCalled();
  });

  it('devuelve el catálogo completo de diez recursos a un member (criterio 3)', async () => {
    listResourcesMock.mockResolvedValue(CATALOG);

    const result = await handler(buildEvent({ sub: 'member-sub', 'cognito:groups': '[member]' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Resource[];
    expect(body).toHaveLength(10);
    expect(body.map((resource) => resource.resourceId)).toEqual(
      CATALOG.map((resource) => resource.resourceId),
    );
  });

  it('devuelve la misma respuesta completa a un admin (criterio 4)', async () => {
    listResourcesMock.mockResolvedValue(CATALOG);

    const result = await handler(buildEvent({ sub: 'admin-sub', 'cognito:groups': '[admin]' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Resource[];
    expect(body).toHaveLength(10);
  });

  it('devuelve una lista vacía sin error cuando el catálogo todavía no se cargó (caso alternativo)', async () => {
    listResourcesMock.mockResolvedValue([]);

    const result = await handler(buildEvent({ sub: 'member-sub', 'cognito:groups': '[member]' }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Resource[];
    expect(body).toEqual([]);
  });

  it('incluye un recurso en MAINTENANCE en la respuesta, sin filtrarlo (criterio 8)', async () => {
    listResourcesMock.mockResolvedValue(CATALOG);

    const result = await handler(buildEvent({ sub: 'member-sub', 'cognito:groups': '[member]' }));

    const body = JSON.parse(result.body) as Resource[];
    const piscina = body.find((resource) => resource.resourceId === 'piscina-1');
    expect(piscina?.resourceStatus).toBe('MAINTENANCE');
  });
});
