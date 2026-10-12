import { describe, expect, it, vi } from 'vitest';

import { safeEmitNotification } from './safe-emit';

const input = {
  event: 'MEMBER_APPROVED' as const,
  data: {},
  entityId: 'member-1',
  memberId: 'member-1',
};

describe('safeEmitNotification', () => {
  it('delega en el emisor y devuelve su resultado', async () => {
    const result = { inbox: 'WRITTEN', email: 'SENT', notificationId: 'n' } as const;
    const emit = vi.fn().mockResolvedValue(result);
    const client = {} as never;

    await expect(safeEmitNotification(input, { emit, client })).resolves.toEqual(result);
    expect(emit).toHaveBeenCalledWith(input, { client });
  });

  it('traga la excepción, devuelve null y la registra sin datos del mensaje', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const emit = vi.fn().mockRejectedValue(new TypeError('texto con datos'));

    await expect(safeEmitNotification(input, { emit, logger })).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const fields = logger.error.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields).toMatchObject({
      event: 'MEMBER_APPROVED',
      memberId: 'member-1',
      reason: 'TypeError',
    });
    expect(JSON.stringify(fields)).not.toContain('texto con datos');
  });
});
