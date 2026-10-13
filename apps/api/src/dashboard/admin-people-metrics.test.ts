import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { computeAdminPeopleMetrics, currentMonthPeriod, MAX_COUNT_PAGES } =
  await import('./admin-people-metrics');

type Input = Record<string, unknown>;
type Responder = (input: Input) => Record<string, unknown>;

function fakeClient(responder: Responder) {
  const send = vi.fn(async (command: { input: Input }) => responder(command.input));
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

const NOW = new Date('2026-10-12T15:00:00.000Z'); // 10:00 en Lima

function pk(input: Input): string {
  return (input['ExpressionAttributeValues'] as Record<string, unknown>)[':pk'] as string;
}

describe('currentMonthPeriod', () => {
  it('mes en curso en Lima expresado en UTC', () => {
    expect(currentMonthPeriod(NOW)).toEqual({
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-11-01T05:00:00.000Z',
      timeZone: 'America/Lima',
    });
  });

  it('usa la fecha de Lima, no la de UTC (1 de nov 03:00 UTC sigue siendo octubre)', () => {
    const period = currentMonthPeriod(new Date('2026-11-01T03:00:00.000Z'));
    expect(period.from).toBe('2026-10-01T05:00:00.000Z');
  });

  it('cruza de año en diciembre', () => {
    expect(currentMonthPeriod(new Date('2026-12-15T12:00:00.000Z'))).toMatchObject({
      from: '2026-12-01T05:00:00.000Z',
      to: '2027-01-01T05:00:00.000Z',
    });
  });
});

describe('computeAdminPeopleMetrics', () => {
  const counts: Record<string, number> = {
    'MEMBER#STATUS#MIGRATED': 40,
    'MEMBER#STATUS#PENDING': 3,
    'MEMBER#STATUS#ACTIVE': 70,
    'RESERVATION#STATUS#PENDING_APPROVAL': 2,
    'PAYMENT#STATUS#SUCCEEDED': 55,
    'PAYMENT#STATUS#FAILED': 3,
    'NOTIFICATION#SENT': 14,
  };

  function responder(input: Input) {
    const partition = pk(input);
    // El conteo de por vencer reutiliza la partición ACTIVE con filtro.
    if (partition === 'MEMBER#STATUS#ACTIVE' && input['FilterExpression']) return { Count: 8 };
    return { Count: counts[partition] ?? 0 };
  }

  it('arma las cifras, con ceros incluidos, solo con Query Select COUNT sobre GSI2', async () => {
    const client = fakeClient(responder);
    const metrics = await computeAdminPeopleMetrics({ client, now: NOW });

    expect(metrics).toEqual({
      periods: {
        currentMonth: {
          from: '2026-10-01T05:00:00.000Z',
          to: '2026-11-01T05:00:00.000Z',
          timeZone: 'America/Lima',
        },
      },
      membersByStatus: { MIGRATED: 40, PENDING: 3, APPROVED: 0, REJECTED: 0, ACTIVE: 70 },
      membershipsExpiringSoon: 8,
      pendingApprovals: 2,
      payments: { succeeded: 55, failed: 3 },
      notificationsSent: 14,
    });

    for (const [command] of client.send.mock.calls) {
      const c = command as unknown as { constructor: { name: string }; input: Input };
      expect(c.constructor.name).toBe('QueryCommand');
      expect(c.input).toMatchObject({ IndexName: 'GSI2', Select: 'COUNT' });
    }
    // 5 estados + por vencer + pendientes + 2 pagos + notificaciones.
    expect(client.send).toHaveBeenCalledTimes(10);
  });

  it('por vencer filtra membershipStatus=EXPIRING_SOON dentro de ACTIVE', async () => {
    const client = fakeClient(responder);
    await computeAdminPeopleMetrics({ client, now: NOW });
    const filtered = client.send.mock.calls
      .map(([c]) => (c as unknown as { input: Input }).input)
      .find((i) => i['FilterExpression']);
    expect(filtered).toMatchObject({
      FilterExpression: '#membershipStatus = :expiring',
      ExpressionAttributeNames: { '#membershipStatus': 'membershipStatus' },
      ExpressionAttributeValues: { ':pk': 'MEMBER#STATUS#ACTIVE', ':expiring': 'EXPIRING_SOON' },
    });
  });

  it('pendientes cuentan solo reservas cuyo inicio no pasó (GSI2SK >= ahora)', async () => {
    const client = fakeClient(responder);
    await computeAdminPeopleMetrics({ client, now: NOW });
    const pending = client.send.mock.calls
      .map(([c]) => (c as unknown as { input: Input }).input)
      .find((i) => pk(i) === 'RESERVATION#STATUS#PENDING_APPROVAL');
    expect(pending).toMatchObject({
      KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK >= :now',
      ExpressionAttributeValues: { ':now': '2026-10-12T15:00:00.000Z' },
    });
  });

  it('pagos y notificaciones usan la ventana del mes; PENDING_CONFIRMATION no se consulta', async () => {
    const client = fakeClient(responder);
    await computeAdminPeopleMetrics({ client, now: NOW });
    const inputs = client.send.mock.calls.map(([c]) => (c as unknown as { input: Input }).input);

    const partitions = inputs.map(pk);
    expect(partitions).not.toContain('PAYMENT#STATUS#PENDING_CONFIRMATION');

    for (const partition of [
      'PAYMENT#STATUS#SUCCEEDED',
      'PAYMENT#STATUS#FAILED',
      'NOTIFICATION#SENT',
    ]) {
      expect(inputs.find((i) => pk(i) === partition)).toMatchObject({
        KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':from': '2026-10-01T05:00:00.000Z',
          ':to': '2026-11-01T05:00:00.000Z',
        },
      });
    }
  });

  it('todo en cero sin error cuando no hay datos', async () => {
    const client = fakeClient(() => ({ Count: 0 }));
    const metrics = await computeAdminPeopleMetrics({ client, now: NOW });
    expect(metrics.membersByStatus).toEqual({
      MIGRATED: 0,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      ACTIVE: 0,
    });
    expect(metrics.payments).toEqual({ succeeded: 0, failed: 0 });
    expect(metrics.notificationsSent).toBe(0);
  });

  it('suma páginas siguiendo LastEvaluatedKey', async () => {
    const client = fakeClient((input) => {
      if (pk(input) !== 'NOTIFICATION#SENT') return { Count: 0 };
      return input['ExclusiveStartKey']
        ? { Count: 5 }
        : { Count: 7, LastEvaluatedKey: { PK: 'x', SK: 'y' } };
    });
    const metrics = await computeAdminPeopleMetrics({ client, now: NOW });
    expect(metrics.notificationsSent).toBe(12);
  });

  it('corta en el tope de páginas y devuelve lo contado', async () => {
    const client = fakeClient((input) =>
      pk(input) === 'NOTIFICATION#SENT'
        ? { Count: 1, LastEvaluatedKey: { PK: 'x', SK: 'y' } }
        : { Count: 0 },
    );
    const metrics = await computeAdminPeopleMetrics({ client, now: NOW });
    expect(metrics.notificationsSent).toBe(MAX_COUNT_PAGES);
  });
});
