import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('./dynamo', async () => {
  const actual = await vi.importActual<typeof import('./dynamo')>('./dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { recordAuditLog } = await import('./audit');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('recordAuditLog', () => {
  it('escribe un ítem AuditLog con PK=AUDIT#<fecha> y SK=<timestamp>#<auditId>', async () => {
    const send = vi.fn().mockResolvedValue({});

    await recordAuditLog(fakeClient(send), {
      action: 'MEMBER_APPROVED',
      actor: { actorId: 'admin-1', actorRole: 'admin' },
      targetType: 'Member',
      targetId: 'member-1',
      now: '2026-07-21T10:00:00.000Z',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as { input: { Item: Record<string, unknown> } };
    const item = command.input.Item;
    expect(item['PK']).toBe('AUDIT#2026-07-21');
    expect(item['SK']).toBe('2026-07-21T10:00:00.000Z#' + (item['auditId'] as string));
    expect(item['entityType']).toBe('AuditLog');
    expect(item['action']).toBe('MEMBER_APPROVED');
    expect(item['actorId']).toBe('admin-1');
    expect(item['actorRole']).toBe('admin');
    expect(item['targetType']).toBe('Member');
    expect(item['targetId']).toBe('member-1');
    expect(item['metadata']).toBeNull();
  });

  it('incluye metadata cuando se provee (p. ej. motivo de rechazo)', async () => {
    const send = vi.fn().mockResolvedValue({});

    await recordAuditLog(fakeClient(send), {
      action: 'MEMBER_REJECTED',
      actor: { actorId: 'admin-1', actorRole: 'admin' },
      targetType: 'Member',
      targetId: 'member-1',
      metadata: { reason: 'Datos no verificables' },
      now: '2026-07-21T10:00:00.000Z',
    });

    const command = send.mock.calls[0]?.[0] as { input: { Item: Record<string, unknown> } };
    expect(command.input.Item['metadata']).toEqual({ reason: 'Datos no verificables' });
  });
});
