#!/usr/bin/env node
// Guarda de consistencia entre los handlers de apps/api y el mapa HANDLERS de
// scripts/package-lambdas.mjs.
//
// Problema que evita: una historia implementa handlers/<grupo>/<accion>.ts pero
// nadie actualiza el mapa, y la Lambda se despliega con el placeholder
// (handlers/not-implemented.ts, responde 501). Ya ocurrio con 5 endpoints de
// reservas (corregido en PR #95).
//
// Falla (exit 1) cuando:
//   (a) existe un handler real (archivo que exporta `handler`, excluyendo
//       *.test.ts y not-implemented.ts) que ninguna entrada del mapa referencia
//       y no figura en UNMAPPED_EXCEPTIONS;
//   (b) una entrada del mapa apunta a un archivo inexistente;
//   (c) una entrada apunta a not-implemented.ts sin el comentario
//       `// PLACEHOLDER(US-NNN)` en la linea inmediatamente anterior.
//
// Uso: node scripts/check-handler-mapping.mjs   (o `npm run check:handlers`)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER_FILE = 'handlers/not-implemented.ts';

// Handlers reales que a proposito NO estan en el mapa (no se empaquetan como
// Lambda). Cada excepcion debe llevar su motivo.
export const UNMAPPED_EXCEPTIONS = {
  'handlers/health/get.ts':
    'Handler de health check de Sprint 0: no tiene Lambda ni ruta en Terraform (environments/dev/main.tf), por eso no se empaqueta.',
};

const ENTRY_RE = /^\s*(?:'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*'([^']+)'/;
const PLACEHOLDER_COMMENT_RE = /\/\/\s*PLACEHOLDER\(US-\d+\)/;
const HANDLER_EXPORT_RE =
  /export\s+(?:const|let|async\s+function|function)\s+handler\b|export\s*\{[^}]*\bhandler\b/;

/** Extrae las entradas del objeto HANDLERS desde el texto de package-lambdas.mjs. */
export function parseHandlersMap(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((l) => /const\s+HANDLERS\s*=\s*\{/.test(l));
  if (start === -1) throw new Error('No se encontro "const HANDLERS = {" en package-lambdas.mjs.');
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\}\s*;?\s*$/.test(lines[i])) break;
    const m = ENTRY_RE.exec(lines[i]);
    if (!m) continue;
    entries.push({
      name: m[1] ?? m[2],
      file: m[3],
      line: i + 1,
      hasPlaceholderComment: i > 0 && PLACEHOLDER_COMMENT_RE.test(lines[i - 1]),
    });
  }
  return entries;
}

/**
 * Logica pura. `realHandlers`: rutas relativas a apps/api/src de handlers
 * reales; `fileExists(rel)`: indica si el archivo existe.
 */
export function analyze({ entries, realHandlers, fileExists, exceptions = UNMAPPED_EXCEPTIONS }) {
  const errors = [];
  const mapped = new Set(entries.map((e) => e.file));
  let real = 0;
  const placeholders = [];

  for (const e of entries) {
    if (!fileExists(e.file)) {
      errors.push(
        `(b) '${e.name}' (package-lambdas.mjs:${e.line}) apunta a '${e.file}', que no existe.`,
      );
    } else if (e.file === PLACEHOLDER_FILE) {
      if (e.hasPlaceholderComment) placeholders.push(e.name);
      else {
        errors.push(
          `(c) '${e.name}' (package-lambdas.mjs:${e.line}) usa el placeholder not-implemented.ts sin ` +
            `'// PLACEHOLDER(US-NNN)' en la linea anterior (responderia 501 sin que nadie lo sepa).`,
        );
      }
    } else {
      real++;
    }
  }

  for (const h of realHandlers) {
    if (!mapped.has(h) && !(h in exceptions)) {
      errors.push(
        `(a) handler huerfano: '${h}' existe pero ningun function_name del mapa HANDLERS lo ` +
          `referencia. Agregalo a scripts/package-lambdas.mjs (y su modulo endpoint_* en Terraform) ` +
          `o documentalo en UNMAPPED_EXCEPTIONS de este script.`,
      );
    }
  }

  return { errors, real, placeholders };
}

function walk(dir) {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const out = (s) => process.stdout.write(`${s}\n`);

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const srcDir = join(root, 'apps', 'api', 'src');
  const source = readFileSync(join(root, 'scripts', 'package-lambdas.mjs'), 'utf8');
  const entries = parseHandlersMap(source);

  const realHandlers = walk(join(srcDir, 'handlers'))
    .map((p) => relative(srcDir, p).split(sep).join('/'))
    .filter((r) => r.endsWith('.ts') && !r.endsWith('.test.ts') && r !== PLACEHOLDER_FILE)
    .filter((r) => HANDLER_EXPORT_RE.test(readFileSync(join(srcDir, r), 'utf8')))
    .sort();

  const { errors, real, placeholders } = analyze({
    entries,
    realHandlers,
    fileExists: (rel) => existsSync(join(srcDir, rel)),
  });

  out('Mapa de handlers (scripts/package-lambdas.mjs)');
  out(`  entradas totales:          ${entries.length}`);
  out(`  entradas reales:           ${real}`);
  out(
    `  placeholders declarados:   ${placeholders.length}${placeholders.length ? ` (${placeholders.join(', ')})` : ''}`,
  );
  out(`  excepciones sin mapear:    ${Object.keys(UNMAPPED_EXCEPTIONS).length}`);

  if (errors.length > 0) {
    console.error(`\nERROR: ${errors.length} problema(s) en el mapa de handlers:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  out('OK: todos los handlers reales estan mapeados y los placeholders declarados.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
