#!/usr/bin/env node
/* eslint-disable no-console -- script de CLI: la salida por consola es su interfaz. */
// Cambia el correo de un socio de PRUEBA en `dev` para que QA reciba en su
// propio buzón los correos del flujo (activación, reservas, avisos de membresía).
//
// El correo vive en tres sitios y el script los cambia juntos:
//   1. DynamoDB: `Member.email` y el ítem de unicidad `UNIQ#EMAIL#<correo>`
//      (se borra el viejo y se crea el nuevo, en una sola transacción).
//   2. Cognito: atributo `email` (verificado) del usuario, si el socio ya activó
//      su cuenta; el login pasa a ser el correo nuevo. La contraseña no cambia.
//   3. SES: pide verificar el correo nuevo (sandbox: solo envía a verificados).
//      QA debe abrir el enlace que le llega, que caduca en 24 horas.
//
// Uso:
//   node scripts/qa-set-email.mjs --list                          -> socios con DNI, correo y estado
//   node scripts/qa-set-email.mjs --dni 10000001 --email qa@x.com -> simulacro (no cambia nada)
//   node scripts/qa-set-email.mjs --dni 10000001 --email qa@x.com --apply
//   (--skip-ses: no pide verificar el correo nuevo; útil para correos ficticios o ya verificados)
//
// Requiere AWS CLI con el perfil `activa-club-dev`. Nunca toca al administrador.
// Procedimiento para QA: docs/qa/pruebas-con-usuarios-reales.md.

import { execFileSync } from 'node:child_process';

const ACCOUNT_ID = '463310123916';
const REGION = 'us-east-1';
const PROFILE = 'activa-club-dev';
const TABLE = 'activa-club-dev';
const USER_POOL_ID = 'us-east-1_qTDbzVP5a';
const ADMIN_EMAIL = 'admin@activaclub.test';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const env = { ...process.env, AWS_PROFILE: PROFILE, AWS_DEFAULT_REGION: REGION };

function aws(...cliArgs) {
  try {
    return execFileSync('aws', cliArgs, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    console.error(
      `Fallo "aws ${cliArgs.slice(0, 2).join(' ')}":\n${error.stderr ?? error.message}`,
    );
    process.exit(1);
  }
}

const awsJson = (...cliArgs) => {
  const out = aws(...cliArgs, '--output', 'json');
  return out.trim() === '' ? {} : JSON.parse(out);
};

const account = awsJson('sts', 'get-caller-identity').Account;
if (account !== ACCOUNT_ID) {
  console.error(`Cuenta AWS inesperada (${account}). Se esperaba ${ACCOUNT_ID}. Aborto.`);
  process.exit(1);
}

const str = (attribute) => attribute?.S ?? null;
const key = (pk) => JSON.stringify({ PK: { S: pk }, SK: { S: pk } });

function getItem(keyJson) {
  return awsJson('dynamodb', 'get-item', '--table-name', TABLE, '--key', keyJson).Item ?? null;
}

if (flag('--list')) {
  const result = awsJson(
    'dynamodb',
    'scan',
    '--table-name',
    TABLE,
    '--filter-expression',
    'SK = :sk',
    '--expression-attribute-values',
    JSON.stringify({ ':sk': { S: 'PROFILE' } }),
  );
  const rows = (result.Items ?? [])
    .map((item) => ({
      dni: str(item.dni),
      nombre: `${str(item.firstName) ?? ''} ${str(item.lastName) ?? ''}`.trim(),
      correo: str(item.email),
      estado: str(item.memberStatus),
      cuenta: str(item.cognitoSub) ? 'activada' : 'sin activar',
    }))
    .sort((a, b) => String(a.dni).localeCompare(String(b.dni)));
  console.table(rows);
  process.exit(0);
}

const dni = value('--dni');
const newEmail = value('--email')?.trim().toLowerCase();
const apply = flag('--apply');

if (!dni || !newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
  console.error('Uso: node scripts/qa-set-email.mjs --dni <dni> --email <correo> [--apply]');
  console.error('     node scripts/qa-set-email.mjs --list');
  process.exit(1);
}

const dniItem = getItem(key(`UNIQ#DNI#${dni}`));
const memberId = str(dniItem?.memberId);
if (!memberId) {
  console.error(`No existe un socio con DNI ${dni}. Usa --list para ver los disponibles.`);
  process.exit(1);
}

const profileKey = JSON.stringify({ PK: { S: `MEMBER#${memberId}` }, SK: { S: 'PROFILE' } });
const member = getItem(profileKey);
const oldEmail = str(member?.email)?.toLowerCase();
const cognitoSub = str(member?.cognitoSub);
if (!member || !oldEmail) {
  console.error(`El socio ${memberId} no tiene perfil o correo. Aborto.`);
  process.exit(1);
}
if (oldEmail === ADMIN_EMAIL || newEmail === ADMIN_EMAIL) {
  console.error('No se cambia el correo del administrador con este script. Aborto.');
  process.exit(1);
}
if (oldEmail === newEmail) {
  console.log('El socio ya tiene ese correo. No hay nada que cambiar.');
  process.exit(0);
}

const owner = str(getItem(key(`UNIQ#EMAIL#${newEmail}`))?.memberId);
if (owner && owner !== memberId) {
  console.error(
    `El correo ${newEmail} ya lo usa otro socio (${owner}). Usa otro (por ejemplo qa+2@...).`,
  );
  process.exit(1);
}

console.log(`Socio:    ${str(member.firstName)} ${str(member.lastName)} (DNI ${dni}, ${memberId})`);
console.log(`Correo:   ${oldEmail}  ->  ${newEmail}`);
console.log(
  `Cuenta:   ${cognitoSub ? 'activada (se actualiza Cognito)' : 'sin activar (solo DynamoDB)'}`,
);

if (!apply) {
  console.log('\nSIMULACRO: no se cambió nada. Agrega --apply para ejecutar.');
  process.exit(0);
}

const now = new Date().toISOString();
aws(
  'dynamodb',
  'transact-write-items',
  '--transact-items',
  JSON.stringify([
    {
      Update: {
        TableName: TABLE,
        Key: JSON.parse(profileKey),
        UpdateExpression: 'SET email = :email, updatedAt = :now',
        ConditionExpression: 'attribute_exists(PK) AND email = :old',
        ExpressionAttributeValues: {
          ':email': { S: newEmail },
          ':old': { S: oldEmail },
          ':now': { S: now },
        },
      },
    },
    { Delete: { TableName: TABLE, Key: JSON.parse(key(`UNIQ#EMAIL#${oldEmail}`)) } },
    {
      Put: {
        TableName: TABLE,
        Item: {
          ...JSON.parse(key(`UNIQ#EMAIL#${newEmail}`)),
          entityType: { S: 'UniqueEmail' },
          memberId: { S: memberId },
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ]),
);
console.log('OK DynamoDB: Member.email y UniqueEmail actualizados.');

if (cognitoSub) {
  aws(
    'cognito-idp',
    'admin-update-user-attributes',
    '--user-pool-id',
    USER_POOL_ID,
    '--username',
    cognitoSub,
    '--user-attributes',
    `Name=email,Value=${newEmail}`,
    'Name=email_verified,Value=true',
  );
  console.log('OK Cognito: correo de acceso actualizado (la contraseña no cambia).');
}

if (flag('--skip-ses')) {
  console.log('SES: omitido (--skip-ses).');
  process.exit(0);
}

aws('ses', 'verify-email-identity', '--email-address', newEmail);
console.log(
  `OK SES: se envió a ${newEmail} el correo de verificación. Debe abrir el enlace (caduca en 24 h)\n` +
    'antes de poder recibir los avisos del sistema.',
);
