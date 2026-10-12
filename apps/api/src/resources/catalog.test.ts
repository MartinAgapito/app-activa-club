import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CATALOG_RESOURCE_IDS } from './catalog';

describe('CATALOG_RESOURCE_IDS', () => {
  it('tiene los diez recursos fijos sin repetir', () => {
    expect(CATALOG_RESOURCE_IDS).toHaveLength(10);
    expect(new Set(CATALOG_RESOURCE_IDS).size).toBe(10);
  });

  it('coincide con el catálogo de Terraform (ADR-0010)', () => {
    const tf = readFileSync(
      join(__dirname, '../../../../infrastructure/terraform/modules/resource-catalog/main.tf'),
      'utf8',
    );
    const ids = [...tf.matchAll(/^\s{4}"([a-z0-9-]+)"\s*=\s*\{/gm)].map((m) => m[1]);
    expect([...CATALOG_RESOURCE_IDS].sort()).toEqual([...ids].sort());
  });
});
