import { describe, expect, it } from 'vitest';
import { resolveRedirectPath } from './role-routes';

describe('resolveRedirectPath', () => {
  it('dirige al home del socio por defecto', () => {
    expect(resolveRedirectPath('member')).toBe('/socio');
  });

  it('dirige al home del administrador por defecto', () => {
    expect(resolveRedirectPath('admin')).toBe('/admin');
  });

  it('respeta la ruta de origen cuando pertenece al mismo rol', () => {
    expect(resolveRedirectPath('member', '/socio/reservas')).toBe('/socio/reservas');
  });

  it('ignora la ruta de origen cuando pertenece a otro rol', () => {
    expect(resolveRedirectPath('member', '/admin/socios')).toBe('/socio');
  });

  it('ignora una ruta de origen nula', () => {
    expect(resolveRedirectPath('admin', null)).toBe('/admin');
  });
});
