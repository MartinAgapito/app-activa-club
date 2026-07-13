import { describe, expect, it } from 'vitest';

import { buildProxyEvent } from '../../testing/fixtures';
import { handler } from './get';

describe('GET /health', () => {
  it('responde 200 con estado ok', async () => {
    const event = buildProxyEvent({ httpMethod: 'GET', path: '/health' });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
