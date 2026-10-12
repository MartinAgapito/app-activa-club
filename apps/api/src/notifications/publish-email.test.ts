import { describe, expect, it, vi } from 'vitest';

const {
  sendPublishedEmails,
  renderPublishedEmail,
  MAX_EMAILS_PER_PUBLICATION,
  EMAIL_MIN_INTERVAL_MS,
  EMAIL_TIME_BUDGET_MS,
} = await import('./publish-email');

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function recipients(n: number, email: boolean = true) {
  return Array.from({ length: n }, (_, i) => ({
    memberId: `m${i}`,
    email: email ? `m${i}@example.com` : null,
    firstName: `Socio${i}`,
  }));
}

/** Reloj falso: `sleep` avanza el tiempo, igual que lo haría el real. */
function fakeTime(start = 1_000_000) {
  let now = start;
  return {
    clock: () => now,
    sleep: vi.fn(async (ms: number) => {
      now += ms;
    }),
    advance: (ms: number) => {
      now += ms;
    },
    start,
  };
}

const base = {
  title: 'Corte de agua',
  body: 'Mañana no habrá agua.',
  requestId: 'r',
  notificationId: 'N',
};

describe('renderPublishedEmail', () => {
  it('escapa HTML del título y del cuerpo (texto plano, criterio 11)', () => {
    const content = renderPublishedEmail('<script>alert(1)</script>', 'a & b <b>x</b>', 'Ana');
    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&lt;script&gt;');
    expect(content.html).toContain('a &amp; b &lt;b&gt;x&lt;/b&gt;');
    expect(content.subject).toBe('Activa Club: <script>alert(1)</script>');
    expect(content.text).toContain('Hola Ana,');
  });
});

describe('sendPublishedEmails', () => {
  it('envía a todos si caben y espacia los envíos', async () => {
    const time = fakeTime();
    const send = vi.fn(async () => undefined);
    const result = await sendPublishedEmails(
      { ...base, recipients: recipients(3), startedAtMs: time.start },
      { emailSender: { send }, clock: time.clock, sleep: time.sleep, logger: logger() },
    );
    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(3);
    // Entre envíos se espera el intervalo mínimo de SES sandbox.
    expect(time.sleep).toHaveBeenCalledTimes(2);
    expect(time.sleep).toHaveBeenCalledWith(EMAIL_MIN_INTERVAL_MS);
  });

  it('respeta el tope por publicación y reporta el resto como omitido', async () => {
    const time = fakeTime();
    const send = vi.fn(async () => undefined);
    const total = MAX_EMAILS_PER_PUBLICATION + 10;
    const result = await sendPublishedEmails(
      { ...base, recipients: recipients(total), startedAtMs: time.start },
      { emailSender: { send }, clock: time.clock, sleep: time.sleep, logger: logger() },
    );
    expect(result).toEqual({ sent: MAX_EMAILS_PER_PUBLICATION, failed: 0, skipped: 10 });
    expect(send).toHaveBeenCalledTimes(MAX_EMAILS_PER_PUBLICATION);
  });

  it('el tope por publicación cabe en el presupuesto de tiempo', () => {
    expect(MAX_EMAILS_PER_PUBLICATION * EMAIL_MIN_INTERVAL_MS).toBeLessThan(EMAIL_TIME_BUDGET_MS);
  });

  it('no inicia envíos pasado el presupuesto de tiempo', async () => {
    const time = fakeTime();
    const send = vi.fn(async () => undefined);
    // La publicación empezó hace 21,5 s: cabe un envío y el siguiente ya no.
    const result = await sendPublishedEmails(
      {
        ...base,
        recipients: recipients(4),
        startedAtMs: time.start - (EMAIL_TIME_BUDGET_MS - 500),
      },
      { emailSender: { send }, clock: time.clock, sleep: time.sleep, logger: logger() },
    );
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 3 });
  });

  it('un fallo de SES no detiene el resto ni lanza', async () => {
    const time = fakeTime();
    const log = logger();
    const send = vi
      .fn<(m: unknown) => Promise<void>>()
      .mockRejectedValueOnce(
        Object.assign(new Error('rejected m0@example.com'), { name: 'MessageRejected' }),
      )
      .mockResolvedValue(undefined);
    const result = await sendPublishedEmails(
      { ...base, recipients: recipients(3), startedAtMs: time.start },
      { emailSender: { send }, clock: time.clock, sleep: time.sleep, logger: log },
    );
    expect(result).toEqual({ sent: 2, failed: 1, skipped: 0 });
    // El log lleva el nombre del error, nunca el correo.
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('example.com');
    expect(log.warn.mock.calls[0]?.[1]).toMatchObject({ reason: 'MessageRejected' });
  });

  it('los socios sin correo se cuentan como omitidos sin consumir tope', async () => {
    const time = fakeTime();
    const send = vi.fn(async () => undefined);
    const mixed = [...recipients(2, false), ...recipients(2)];
    const result = await sendPublishedEmails(
      { ...base, recipients: mixed, startedAtMs: time.start },
      { emailSender: { send }, clock: time.clock, sleep: time.sleep, logger: logger() },
    );
    expect(result).toEqual({ sent: 2, failed: 0, skipped: 2 });
  });

  it('sin remitente configurado omite todo', async () => {
    const log = logger();
    const result = await sendPublishedEmails(
      { ...base, recipients: recipients(5), startedAtMs: Date.now() },
      { emailSender: null, logger: log },
    );
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 5 });
    expect(log.warn).toHaveBeenCalled();
  });
});
