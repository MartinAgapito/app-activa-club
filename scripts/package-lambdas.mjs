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
//
// Guarda de CI (scripts/check-handler-mapping.mjs, `npm run check:handlers`):
// todo handler real debe estar aqui, y una entrada que apunte a
// handlers/not-implemented.ts debe llevar `// PLACEHOLDER(US-NNN)` en la linea
// inmediatamente anterior.
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
  // Carga inicial de socios (US-012, ADR-0012): Lambda de invocacion directa,
  // sin API Gateway ni ruta HTTP. Ver module "job_migration_run" en main.tf.
  'migration-run': 'handlers/migration/run.ts',
  // EP-03 (US-019 infra ya desplegada; logica de negocio por historia).
  // Las 5 funciones sin logica propia todavia apuntan al placeholder
  // compartido (ver handlers/not-implemented.ts) -- cada historia lo
  // reemplaza por su handler real al implementarse, una funcion a la vez.
  'memberships-plans': 'handlers/memberships/get-plans.ts', // US-020 (implementado)
  'payments-create': 'handlers/payments/post.ts', // US-021 (implementado)
  'payments-list': 'handlers/payments/list.ts', // US-025 (implementado)
  'payments-get-by-id': 'handlers/payments/get-by-id.ts', // US-025 (implementado)
  'payments-webhook': 'handlers/payments/webhook.ts', // US-024 (implementado)
  'members-update-auto-renew': 'handlers/members/patch-me-auto-renew.ts', // US-023 (implementado)
  // EP-04 (US-027 infra ya desplegada; logica de negocio por historia,
  // US-028..US-036). Las funciones restantes sin logica propia todavia
  // apuntan al placeholder compartido (ver handlers/not-implemented.ts) --
  // cada historia lo reemplaza por su handler real al implementarse, una
  // funcion a la vez (mismo patron ya usado para EP-03).
  'resources-list': 'handlers/resources/list.ts', // US-028 (implementado)
  'resources-availability': 'handlers/reservations/availability.ts', // US-029 (implementado)
  'resources-update': 'handlers/resources/update.ts', // US-036
  'resources-maintenance-create': 'handlers/resources/maintenance-create.ts', // US-035
  'resources-maintenance-delete': 'handlers/resources/maintenance-delete.ts', // US-035
  'resources-maintenance-list': 'handlers/resources/maintenance-list.ts', // US-035
  'reservations-create': 'handlers/reservations/create.ts', // US-030/US-031 (implementado)
  'reservations-list': 'handlers/reservations/list.ts', // US-033/US-036 (implementado)
  'reservations-get-by-id': 'handlers/reservations/get-by-id.ts', // US-033 (implementado)
  'reservations-cancel': 'handlers/reservations/cancel.ts', // US-033/US-036 (implementado)
  'reservations-approve': 'handlers/reservations/approve.ts', // US-034 (implementado)
  'reservations-reject': 'handlers/reservations/reject.ts', // US-034 (implementado)
  'members-lookup': 'handlers/members/lookup.ts', // US-031 (implementado)
  'guests-lookup': 'handlers/guests/lookup.ts', // US-031 (implementado)
  // EP-03, US-038: proceso programado (EventBridge), no HTTP. Ver
  // module "job_memberships_expire" en environments/dev/main.tf.
  'memberships-expire': 'handlers/memberships/expire.ts', // US-038 (implementado)
  // EP-05, US-047: proceso programado (EventBridge), no HTTP, 08:00 Lima.
  // Ver module "job_memberships_notify" en environments/dev/main.tf.
  'memberships-notify': 'handlers/memberships/notify.ts', // US-047 (implementado)
  // EP-05, US-046: proceso programado (EventBridge), no HTTP. Ver
  // module "job_reservations_remind" en environments/dev/main.tf.
  'reservations-remind': 'handlers/reservations/remind.ts', // US-046 (implementado)
  // EP-05 (US-039 infra ya desplegada; logica de negocio por historia).
  'notifications-list': 'handlers/notifications/list.ts', // US-041 (implementado)
  'notifications-read': 'handlers/notifications/read.ts', // US-041 (implementado)
  'notifications-create': 'handlers/notifications/create.ts', // US-048 (implementado)
  'notifications-sent': 'handlers/notifications/sent.ts', // US-048 (implementado)
  // EP-07 (US-054 infra ya desplegada; logica de negocio por historia).
  'dashboard-member': 'handlers/dashboard/member.ts', // US-055 (implementado)
  'dashboard-admin': 'handlers/dashboard/admin.ts', // US-057 y US-058 (implementados)
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
