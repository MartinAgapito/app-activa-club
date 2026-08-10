// Reglas de cálculo de franjas del mock de disponibilidad (US-029): franjas
// desde `opensAt` hasta `closesAt` en pasos de `blockMinutes`, conversión a
// UTC ISO-8601 desde hora local del club, y precedencia de motivos
// `PAST` -> `MAINTENANCE` -> `RESERVED`.

import { describe, expect, it } from 'vitest';
import type { Resource } from '@activa-club/shared-types';
import { generateMockAvailability } from './availability-mock';

const FUTBOL: Resource = {
  resourceId: 'futbol-1',
  type: 'FUTBOL',
  name: 'Cancha de fútbol 1',
  capacity: 14,
  blockMinutes: 90,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

describe('generateMockAvailability', () => {
  it('genera la primera franja a las 06:00 hora de Lima (11:00Z) y respeta blockMinutes', () => {
    const response = generateMockAvailability(
      FUTBOL,
      '2026-08-12',
      new Date('2020-01-01T00:00:00Z'),
    );

    expect(response.slots[0]).toMatchObject({
      startsAt: '2026-08-12T11:00:00Z',
      endsAt: '2026-08-12T12:30:00Z',
    });
  });

  it('no ofrece una franja que no cabe completa antes de closesAt', () => {
    const response = generateMockAvailability(
      FUTBOL,
      '2026-08-12',
      new Date('2020-01-01T00:00:00Z'),
    );
    const lastSlot = response.slots.at(-1)!;

    // 22:00 - 06:00 = 16h = 960 min; 960 / 90 = 10.67 -> 10 franjas completas
    // (la última es 19:30-21:00 hora de Lima; 22:30 no cabría antes de las 22:00).
    expect(response.slots).toHaveLength(10);
    expect(lastSlot.startsAt).toBe('2026-08-13T00:30:00Z'); // 19:30 Lima
    expect(lastSlot.endsAt).toBe('2026-08-13T02:00:00Z'); // 21:00 Lima
  });

  it('marca todas las franjas como MAINTENANCE cuando el recurso está en resourceStatus=MAINTENANCE', () => {
    const response = generateMockAvailability(
      { ...FUTBOL, resourceStatus: 'MAINTENANCE' },
      '2026-08-12',
      new Date('2020-01-01T00:00:00Z'),
    );

    expect(response.resourceStatus).toBe('MAINTENANCE');
    expect(response.slots.every((slot) => slot.status === 'MAINTENANCE' && !slot.available)).toBe(
      true,
    );
  });

  it('marca como PAST las franjas cuyo inicio ya pasó, con precedencia sobre RESERVED/MAINTENANCE', () => {
    // "Ahora" muy posterior a todas las franjas del día consultado.
    const response = generateMockAvailability(
      FUTBOL,
      '2026-08-12',
      new Date('2026-08-14T00:00:00Z'),
    );

    expect(response.slots.every((slot) => slot.status === 'PAST' && !slot.available)).toBe(true);
  });
});
