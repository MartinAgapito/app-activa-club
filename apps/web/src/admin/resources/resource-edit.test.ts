import { describe, expect, it } from 'vitest';
import type { Resource } from '@activa-club/shared-types';
import {
  buildResourceUpdate,
  describeChangeNotes,
  describeChanges,
  isValidResourceUpdate,
  resourceEditFormSchema,
  toFormValues,
} from './resource-edit';

const RESOURCE: Resource = {
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

describe('resource-edit', () => {
  it('no genera cambios si los valores son los actuales', () => {
    expect(buildResourceUpdate(RESOURCE, toFormValues(RESOURCE))).toEqual({});
  });

  it('envía solo los campos modificados y nunca los de solo lectura', () => {
    const request = buildResourceUpdate(RESOURCE, {
      ...toFormValues(RESOURCE),
      capacity: 10,
      resourceStatus: 'MAINTENANCE',
    });
    expect(request).toEqual({ capacity: 10, resourceStatus: 'MAINTENANCE' });
    expect(isValidResourceUpdate(request)).toBe(true);
  });

  it('el esquema estricto del contrato rechaza campos no editables', () => {
    expect(isValidResourceUpdate({ blockMinutes: 60 })).toBe(false);
    expect(isValidResourceUpdate({})).toBe(false);
  });

  it('valida aforo positivo, formato HH:mm y cierre posterior a apertura', () => {
    const base = toFormValues(RESOURCE);
    expect(resourceEditFormSchema.safeParse(base).success).toBe(true);
    expect(resourceEditFormSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(resourceEditFormSchema.safeParse({ ...base, capacity: 1.5 }).success).toBe(false);
    expect(resourceEditFormSchema.safeParse({ ...base, opensAt: '6:00' }).success).toBe(false);
    const inverted = resourceEditFormSchema.safeParse({
      ...base,
      opensAt: '22:00',
      closesAt: '22:00',
    });
    expect(inverted.success).toBe(false);
  });

  it('describe cambios y notas de reservas existentes y mantenimiento', () => {
    const request = { capacity: 10, closesAt: '21:00', resourceStatus: 'MAINTENANCE' as const };
    expect(describeChanges(RESOURCE, request).map((line) => line.label)).toEqual([
      'Aforo',
      'Cierre',
      'Estado',
    ]);
    expect(describeChangeNotes(RESOURCE, request)).toEqual({
      existingReservationsKept: true,
      indefiniteMaintenance: true,
    });
    expect(describeChangeNotes(RESOURCE, { capacity: 20 })).toEqual({
      existingReservationsKept: false,
      indefiniteMaintenance: false,
    });
  });
});
