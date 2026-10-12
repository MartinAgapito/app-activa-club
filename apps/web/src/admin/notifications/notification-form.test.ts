import { describe, expect, it } from 'vitest';
import { createNotificationSchema } from '@activa-club/validation';
import {
  BODY_MAX_LENGTH,
  EMPTY_NOTIFICATION_FORM,
  TITLE_MAX_LENGTH,
  buildNotificationRequest,
} from './notification-form';

const base = { ...EMPTY_NOTIFICATION_FORM, title: 'Aviso', body: 'Texto' };

describe('notification-form', () => {
  it('los límites del formulario coinciden con createNotificationSchema', () => {
    const request = (title: string, body: string) =>
      createNotificationSchema.safeParse(buildNotificationRequest({ ...base, title, body }));
    expect(request('a'.repeat(TITLE_MAX_LENGTH), 'x').success).toBe(true);
    expect(request('a'.repeat(TITLE_MAX_LENGTH + 1), 'x').success).toBe(false);
    expect(request('t', 'b'.repeat(BODY_MAX_LENGTH)).success).toBe(true);
    expect(request('t', 'b'.repeat(BODY_MAX_LENGTH + 1)).success).toBe(false);
  });

  it('solo envía el destino que corresponde al segmento', () => {
    const stale = { ...base, targetMemberId: 'm-1', resourceId: 'r-1' };
    expect(buildNotificationRequest({ ...stale, segment: 'DEBT' })).toEqual({
      segment: 'DEBT',
      title: 'Aviso',
      body: 'Texto',
      alsoEmail: false,
    });
    expect(buildNotificationRequest({ ...stale, segment: 'SINGLE' })).toMatchObject({
      targetMemberId: 'm-1',
    });
    expect(buildNotificationRequest({ ...stale, segment: 'BY_RESOURCE' })).toMatchObject({
      resourceId: 'r-1',
    });
  });

  it('recorta espacios del título y del mensaje', () => {
    expect(
      buildNotificationRequest({ ...base, title: '  Hola ', body: ' Cuerpo\n' }),
    ).toMatchObject({ title: 'Hola', body: 'Cuerpo' });
  });
});
