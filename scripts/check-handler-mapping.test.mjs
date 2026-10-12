import { describe, expect, it } from 'vitest';
import { analyze, parseHandlersMap } from './check-handler-mapping.mjs';

const SOURCE = `
const HANDLERS = {
  registration: 'handlers/registration/post.ts',
  // PLACEHOLDER(US-099)
  'foo-bar': 'handlers/not-implemented.ts',
  'sin-marca': 'handlers/not-implemented.ts',
};
`;

const opts = (over) => ({
  entries: parseHandlersMap(SOURCE),
  realHandlers: ['handlers/registration/post.ts'],
  fileExists: () => true,
  exceptions: {},
  ...over,
});

describe('check-handler-mapping', () => {
  it('parsea entradas y el comentario PLACEHOLDER de la linea anterior', () => {
    const e = parseHandlersMap(SOURCE);
    expect(e.map((x) => x.name)).toEqual(['registration', 'foo-bar', 'sin-marca']);
    expect(e.map((x) => x.hasPlaceholderComment)).toEqual([false, true, false]);
  });

  it('(c) falla con placeholder sin comentario y acepta el declarado', () => {
    const r = analyze(opts());
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('(c)');
    expect(r.errors[0]).toContain('sin-marca');
    expect(r.placeholders).toEqual(['foo-bar']);
    expect(r.real).toBe(1);
  });

  it('(a) falla con handler huerfano y lo tolera si esta en excepciones', () => {
    const entries = parseHandlersMap(SOURCE).slice(0, 1);
    const huerfano = analyze(
      opts({ entries, realHandlers: ['handlers/registration/post.ts', 'handlers/x/nuevo.ts'] }),
    );
    expect(huerfano.errors).toHaveLength(1);
    expect(huerfano.errors[0]).toContain('(a)');
    const ok = analyze(
      opts({
        entries,
        realHandlers: ['handlers/x/nuevo.ts', 'handlers/registration/post.ts'],
        exceptions: { 'handlers/x/nuevo.ts': 'motivo' },
      }),
    );
    expect(ok.errors).toEqual([]);
  });

  it('(b) falla cuando la entrada apunta a un archivo inexistente', () => {
    const entries = parseHandlersMap(SOURCE).slice(0, 1);
    const r = analyze(opts({ entries, fileExists: () => false }));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('(b)');
  });
});
