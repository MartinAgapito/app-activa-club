import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = sendMock;
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));

const { createSesEmailSender, getSenderEmail } = await import('./mailer');

describe('createSesEmailSender', () => {
  beforeEach(() => {
    sendMock.mockReset();
    delete process.env['SES_SENDER_EMAIL'];
  });

  it('envía SendEmail con contenido simple (sin plantillas SES) y UTF-8', async () => {
    sendMock.mockResolvedValue({});
    await createSesEmailSender('no-reply@club.test').send({
      to: 'ana@example.com',
      subject: 'Asunto',
      text: 'texto',
      html: '<p>html</p>',
    });
    const command = sendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toEqual({
      FromEmailAddress: 'no-reply@club.test',
      Destination: { ToAddresses: ['ana@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Asunto', Charset: 'UTF-8' },
          Body: {
            Text: { Data: 'texto', Charset: 'UTF-8' },
            Html: { Data: '<p>html</p>', Charset: 'UTF-8' },
          },
        },
      },
    });
  });

  it('propaga el error de SES (el módulo de emisión lo absorbe)', async () => {
    sendMock.mockRejectedValue(new Error('MessageRejected'));
    await expect(
      createSesEmailSender('a@b.c').send({ to: 'x@y.z', subject: 's', text: 't', html: 'h' }),
    ).rejects.toThrow('MessageRejected');
  });

  it('getSenderEmail lee SES_SENDER_EMAIL y trata vacío como no configurado', () => {
    expect(getSenderEmail()).toBeUndefined();
    process.env['SES_SENDER_EMAIL'] = '';
    expect(getSenderEmail()).toBeUndefined();
    process.env['SES_SENDER_EMAIL'] = 'no-reply@club.test';
    expect(getSenderEmail()).toBe('no-reply@club.test');
  });
});
