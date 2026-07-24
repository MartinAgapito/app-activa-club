#!/usr/bin/env node
// Empaqueta cada handler real de apps/api en un .zip autocontenido listo para
// `source_zip_path` de infrastructure/terraform/modules/endpoint (ver su
// README y docs/deployment/despliegue-dev.md).
//
// Por qué bundling (esbuild) y no "tsc build" + zip directo del dist/:
// - Los imports relativos compilados por tsc (apps/api usa moduleResolution
//   "Bundler") no incluyen extensión ".js", que el runtime de Node en modo
//   ESM exige para imports relativos. Un zip con el dist/ tal cual fallaría
//   en Lambda con ERR_MODULE_NOT_FOUND.
// - Los paquetes de workspace (@activa-club/shared-types, @activa-club/validation)
//   declaran "main": "./src/index.ts" (fuente TypeScript, no ejecutable por
//   Node). Lambda no tiene ni tsc ni un loader de TypeScript en runtime.
// - esbuild resuelve todo el árbol de imports (workspaces + dependencias de
//   npm) en tiempo de build y emite un único archivo CommonJS
//   autocontenido (sin node_modules en el zip), evitando ambos problemas y
//   manteniendo el paquete de cada función pequeño y fácil de auditar.
//
// Un zip por handler (no un zip compartido): cada Lambda de
// modules/endpoint ya es una función independiente con su propio rol IAM de
// mínimo privilegio (ADR-0004); un artefacto por función mantiene esa misma
// separación y permite ver en el resumen de este script el tamaño individual
// de cada endpoint.
//
// Uso:
//   node scripts/package-lambdas.mjs
//   node scripts/package-lambdas.mjs --only=members-approve
//   LAMBDA_ARTIFACTS_DIR=/ruta/personalizada node scripts/package-lambdas.mjs

import { build } from 'esbuild';
import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const API_SRC_DIR = join(REPO_ROOT, 'apps', 'api', 'src');

// function_name -> entry point (relativo a apps/api/src), en el mismo orden
// en que se declaran los módulos "endpoint_*" en
// infrastructure/terraform/environments/dev/main.tf (y, cuando exista,
// environments/prd/main.tf). Mantener esta tabla sincronizada con esos
// archivos: es la única fuente de verdad de qué handler compila a qué
// artefacto.
const HANDLERS = {
  'activation-verify': 'handlers/activation/verify.ts',
  'activation-complete': 'handlers/activation/complete.ts',
  registration: 'handlers/registration/post.ts',
  'members-get-me': 'handlers/members/get-me.ts',
  'members-update-me': 'handlers/members/patch-me.ts',
  'members-list': 'handlers/members/list.ts',
  'members-get-by-id': 'handlers/members/get-by-id.ts',
  'members-approve': 'handlers/members/approve.ts',
  'members-reject': 'handlers/members/reject.ts',
  'admin-migration-run': 'handlers/admin/run-migration.ts',
};

const artifactsDir = process.env.LAMBDA_ARTIFACTS_DIR ?? join(REPO_ROOT, '.lambda-artifacts');
const bundleDir = join(artifactsDir, '.bundle');

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;

function selectedHandlers() {
  if (!only) return Object.entries(HANDLERS);
  const entry = HANDLERS[only];
  if (!entry) {
    throw new Error(
      `--only=${only} no coincide con ningun function_name conocido (${Object.keys(HANDLERS).join(', ')}).`,
    );
  }
  return [[only, entry]];
}

async function bundleHandler(functionName, relativeEntry) {
  const entryPoint = join(API_SRC_DIR, relativeEntry);
  const outfile = join(bundleDir, functionName, 'index.js');

  // Bundle CommonJS autocontenido: Lambda Node.js runtime ejecuta CJS sin
  // requerir "type": "module" en el zip ni resolver imports por extensión.
  // Sin minificar (prioriza tamaños de zip legibles/depurables en logs de
  // CloudWatch sobre unos KB de ahorro; el runtime ya factura por invocación,
  // no por tamaño de paquete en este rango).
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: false,
    logLevel: 'warning',
  });

  return outfile;
}

function zipDirectory(sourceDir, destZipPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn(`[package-lambdas] aviso al comprimir ${sourceDir}: ${err.message}`);
        return;
      }
      reject(err);
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function main() {
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  const handlers = selectedHandlers();
  const results = [];

  for (const [functionName, relativeEntry] of handlers) {
    const bundledDir = join(bundleDir, functionName);
    await bundleHandler(functionName, relativeEntry);

    const zipPath = join(artifactsDir, `${functionName}.zip`);
    const bytes = await zipDirectory(bundledDir, zipPath);
    results.push({ functionName, zipPath, bytes });
  }

  await rm(bundleDir, { recursive: true, force: true });

  console.error('[package-lambdas] artefactos generados:');
  for (const { functionName, zipPath, bytes } of results) {
    const kb = (bytes / 1024).toFixed(1);
    console.error(`  - ${functionName}: ${zipPath} (${kb} KB)`);
  }
  console.error(`[package-lambdas] LAMBDA_ARTIFACTS_DIR=${artifactsDir}`);
}

main().catch((error) => {
  console.error('[package-lambdas] fallo empaquetando Lambdas:', error);
  process.exitCode = 1;
});
