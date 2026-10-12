import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getReminderRecipient, listRemindableReservations } from './remind-repository';

const send = vi.fn();
const client = { send } as unknown as DynamoDBDocumentClient;

describe('listRemindableReservations (patrón 21, GSI3)', () => {
  beforeEach(() => {
    send.mockReset();
    process.env['DYNAMODB_TABLE_NAME'] = 'activa-club-test';
  });

  it('consulta GSI3 por recurso con rango semiabierto y filtro de estado, sin Scan', async () => {
    send.mockResolvedValueOnce({ Items: [{ reservationId: 'r1' }] });

    const result = await listRemindableReservations(client, 'futbol-1', {
      from: '2026-07-11T05:00:00.000Z',
      to: '2026-07-12T05:00:00.000Z',
    });

    expect(result).toEqual([{ reservationId: 'r1' }]);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    expect(command.constructor.name).toBe('QueryCommand');
    expect(command.input).toMatchObject({
      IndexName: 'GSI3',
      KeyConditionExpression: 'GSI3PK = :pk AND GSI3SK BETWEEN :from AND :to',
      ExpressionAttributeValues: {
        ':pk': 'RESOURCE#futbol-1',
        ':from': 'SLOT#2026-07-11T05:00:00.000Z',
        ':to': 'SLOT#2026-07-12T05:00:00.000Z',
        ':entityType': 'Reservation',
        ':confirmed': 'CONFIRMED',
        ':approved': 'APPROVED',
      },
    });
  });

  it('sigue LastEvaluatedKey hasta agotar las páginas', async () => {
    send
      .mockResolvedValueOnce({ Items: [{ reservationId: 'r1' }], LastEvaluatedKey: { PK: 'x' } })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { PK: 'y' } })
      .mockResolvedValueOnce({ Items: [{ reservationId: 'r2' }] });

    const result = await listRemindableReservations(client, 'tenis-1', { from: 'a', to: 'b' });

    expect(result.map((r) => r.reservationId)).toEqual(['r1', 'r2']);
    expect(send).toHaveBeenCalledTimes(3);
    const second = send.mock.calls[1]![0] as { input: { ExclusiveStartKey: unknown } };
    expect(second.input.ExclusiveStartKey).toEqual({ PK: 'x' });
  });

  it('devuelve lista vacía si no hay Items', async () => {
    send.mockResolvedValueOnce({});

    await expect(
      listRemindableReservations(client, 'tenis-1', { from: 'a', to: 'b' }),
    ).resolves.toEqual([]);
  });
});

describe('getReminderRecipient', () => {
  beforeEach(() => {
    send.mockReset();
    process.env['DYNAMODB_TABLE_NAME'] = 'activa-club-test';
  });

  it('lee el titular con proyección mínima', async () => {
    send.mockResolvedValueOnce({ Item: { memberId: 'm-1', email: 'a@b.pe', firstName: 'Ana' } });

    const result = await getReminderRecipient(client, 'm-1');

    expect(result).toEqual({ memberId: 'm-1', email: 'a@b.pe', firstName: 'Ana' });
    const command = send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: { PK: 'MEMBER#m-1', SK: 'PROFILE' },
      ProjectionExpression: 'memberId, email, firstName',
    });
  });

  it('devuelve null si no existe o no tiene nombre', async () => {
    send.mockResolvedValueOnce({});
    await expect(getReminderRecipient(client, 'm-x')).resolves.toBeNull();
    send.mockResolvedValueOnce({ Item: { memberId: 'm-x' } });
    await expect(getReminderRecipient(client, 'm-x')).resolves.toBeNull();
  });

  it('normaliza un correo ausente a null', async () => {
    send.mockResolvedValueOnce({ Item: { memberId: 'm-1', firstName: 'Ana' } });

    await expect(getReminderRecipient(client, 'm-1')).resolves.toEqual({
      memberId: 'm-1',
      email: null,
      firstName: 'Ana',
    });
  });
});
