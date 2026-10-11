#!/usr/bin/env node
/* eslint-disable no-console -- script de CLI: la salida por consola es su interfaz. */
// Reinicia los DATOS del entorno `dev` dejando el catálogo de instalaciones.
//
// Qué hace (en este orden):
//   1. DynamoDB `activa-club-dev`: borra todos los ítems EXCEPTO el catálogo
//      (PK `RESOURCE#<id>` con SK `METADATA`, que gestiona Terraform).
//   2. Cognito `activa-club-dev-users`: borra todos los usuarios EXCEPTO el
//      admin (omitir con --keep-cognito).
//
// Qué NO toca: tabla, índices, buckets, parámetros SSM de Stripe, estado de
// Terraform ni ningún recurso de otro entorno.
//
// Uso:
//   node scripts/dev-reset.mjs            -> simulacro: solo muestra qué borraría
//   node scripts/dev-reset.mjs --apply    -> respalda y borra de verdad
//   node scripts/dev-reset.mjs --apply --keep-cognito
//
// Requiere AWS CLI con el perfil `activa-club-dev`. Procedimiento completo en
// docs/deployment/migracion-inicial-dev.md.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT_ID = '463310123916';
const REGION = 'us-east-1';
const PROFILE = 'activa-club-dev';
const TABLE = 'activa-club-dev';
const USER_POOL_ID = 'us-east-1_qTDbzVP5a';
const KEEP_ADMIN_EMAIL = 'admin@activaclub.test';

const APPLY = process.argv.includes('--apply');
const KEEP_COGNITO = process.argv.includes('--keep-cognito');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, AWS_PROFILE: PROFILE, AWS_DEFAULT_REGION: REGION };

function aws(...args) {
  try {
    return execFileSync('aws', args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    console.error(`Fallo "aws ${args.slice(0, 2).join(' ')}":\n${error.stderr ?? error.message}`);
    process.exit(1);
  }
}

const awsJson = (...args) => JSON.parse(aws(...args, '--output', 'json'));

// Salvaguarda 1: solo la cuenta del proyecto.
const account = awsJson('sts', 'get-caller-identity').Account;
if (account !== ACCOUNT_ID) {
  console.error(`Cuenta AWS inesperada (${account}). Se esperaba ${ACCOUNT_ID}. Aborto.`);
  process.exit(1);
}

const items = awsJson('dynamodb', 'scan', '--table-name', TABLE).Items;
const isCatalog = (item) => item.PK.S.startsWith('RESOURCE#') && item.SK.S === 'METADATA';
const keep = items.filter(isCatalog);
const toDelete = items.filter((item) => !isCatalog(item));

const typeOf = (item) => item.entityType?.S ?? item.SK.S.split('#')[0];
const byType = {};
for (const item of toDelete) byType[typeOf(item)] = (byType[typeOf(item)] ?? 0) + 1;

const users = KEEP_COGNITO
  ? []
  : awsJson('cognito-idp', 'list-users', '--user-pool-id', USER_POOL_ID).Users;
const emailOf = (user) => user.Attributes.find((a) => a.Name === 'email')?.Value ?? '?';
const usersToDelete = users.filter((user) => emailOf(user) !== KEEP_ADMIN_EMAIL);

console.log(`Tabla ${TABLE} (${account}, ${REGION})`);
console.log(`  Catálogo que se conserva : ${keep.length}`);
console.log(`  Ítems a borrar           : ${toDelete.length}`, byType);
console.log(
  KEEP_COGNITO
    ? '  Cognito                  : se omite (--keep-cognito)'
    : `  Usuarios Cognito a borrar: ${usersToDelete.length} ${JSON.stringify(usersToDelete.map(emailOf))} (se conserva ${KEEP_ADMIN_EMAIL})`,
);

// Salvaguarda 2: el catálogo debe estar completo; si no, algo es distinto de lo esperado.
if (keep.length !== 10) {
  console.error(`Se esperaban 10 ítems de catálogo y hay ${keep.length}. Aborto sin borrar.`);
  process.exit(1);
}

if (!APPLY) {
  console.log('\nSimulacro: no se borró nada. Ejecuta con --apply para aplicar.');
  process.exit(0);
}

// Salvaguarda 3: confirmación escrita.
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('\nEscribe BORRAR para continuar: ');
rl.close();
if (answer.trim() !== 'BORRAR') {
  console.log('Cancelado. No se borró nada.');
  process.exit(0);
}

// Respaldo local (carpeta ignorada por git).
const backupDir = join(ROOT, 'mock-data', 'local');
mkdirSync(backupDir, { recursive: true });
const backupFile = join(
  backupDir,
  `backup-dev-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(backupFile, JSON.stringify(items, null, 1));
console.log(`Respaldo: ${backupFile}`);

// 1) DynamoDB primero.
for (const item of toDelete) {
  aws(
    'dynamodb',
    'delete-item',
    '--table-name',
    TABLE,
    '--key',
    JSON.stringify({ PK: item.PK, SK: item.SK }),
    '--condition-expression',
    'attribute_exists(PK)',
  );
}
console.log(`DynamoDB: borrados ${toDelete.length}`);

// 2) Cognito después (nunca al revés: cuentas sin ficha dan errores confusos).
for (const user of usersToDelete) {
  aws(
    'cognito-idp',
    'admin-delete-user',
    '--user-pool-id',
    USER_POOL_ID,
    '--username',
    user.Username,
  );
  console.log(`Cognito: borrado ${emailOf(user)}`);
}

const left = awsJson('dynamodb', 'scan', '--table-name', TABLE, '--select', 'COUNT').Count;
console.log(`\nVerificación: ítems en la tabla = ${left} (esperado 10, solo el catálogo).`);
process.exit(left === 10 ? 0 : 1);
