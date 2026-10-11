# Runbook: carga inicial de socios en `dev` (migración)

Procedimiento manual y repetible para cargar los socios del "sistema
on-premise" en el entorno `dev`. Lo ejecuta una persona (no el CD) porque
escribe datos de negocio. Referencias: [mapeo-migracion.md](../data/mapeo-migracion.md)
y el contrato de invocación en [contratos-api.md](../api/contratos-api.md) §10.
La migración es una Lambda de **invocación directa**, sin endpoint HTTP
([ADR-0012](../architecture/adr/ADR-0012-migracion-lambda-invocacion-directa.md)).

## Qué se carga y qué no

| Dato                                            | Cómo entra                                              |
| ----------------------------------------------- | ------------------------------------------------------- |
| Catálogo de instalaciones (10 ítems `METADATA`) | `terraform apply` (ADR-0010). **No** va aquí.           |
| Socios, membresía vigente y saldo pendiente     | **Este runbook** (JSON en S3 + Lambda `migration-run`). |
| Reservas, pagos, invitados, bloqueos, auditoría | Se generan usando la aplicación.                        |
| Cuentas de acceso (Cognito) de los socios       | Cada socio las crea al activar su cuenta (DNI).         |

## Datos del entorno

| Elemento          | Valor                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Cuenta / región   | `463310123916` / `us-east-1` (perfil AWS `activa-club-dev`)      |
| Bucket            | `activa-club-dev-migration`                                      |
| Objeto            | **`legacy-export.json`** (el nombre es fijo, lo lee el handler)  |
| Lambda            | `activa-club-dev-migration-run` (sin API Gateway)                |
| Permiso requerido | IAM `lambda:InvokeFunction` sobre esa función (no rol de la app) |

## Archivos del procedimiento (dentro del repo)

| Archivo                                                              | Para qué sirve                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| [`mock-data/legacy-export.json`](../../mock-data/legacy-export.json) | Datos ficticios de socios. Se sube **tal cual** a S3. |

El archivo ya se llama `legacy-export.json`, que es el nombre exacto que lee el
handler. Un caso por socio:

| DNI      | Socio | Situación                | Resultado esperado               |
| -------- | ----- | ------------------------ | -------------------------------- |
| 10000001 | Ana   | Anual vigente, sin deuda | `ACTIVE`                         |
| 10000002 | Luis  | Saldo pendiente de S/ 50 | `DEBT`                           |
| 10000003 | Carla | Vence en 7 días o menos  | `EXPIRING_SOON`                  |
| 10000004 | Diego | Venció                   | `EXPIRED`                        |
| 10000005 | Eva   | Anual vigente, sin deuda | `ACTIVE`                         |
| 10000006 | —     | Sin correo               | **Rechazado** sin frenar el lote |

Si el procedimiento se repite en otra fecha, ajustar las fechas de Carla (que
venza en 7 días o menos) y de Diego (que `fin` sea anterior a hoy). Luis tiene
deuda, así que su estado es `DEBT` sin importar la fecha.

## Precondiciones

1. Tabla `activa-club-dev` sin socios: solo los 10 ítems `METADATA` del
   catálogo. Si hay datos anteriores, ver "Reiniciar el entorno".
2. Acceso a la consola de AWS de la cuenta `463310123916`, región `us-east-1`.

## Paso 1. Subir el archivo (consola de S3)

1. **S3** → bucket **`activa-club-dev-migration`** → **Upload** → **Add files**.
2. Elegir `mock-data/legacy-export.json` (el nombre no debe cambiar).
3. **Upload** y confirmar que el objeto aparece en la lista.

## Paso 2. Ejecutar la migración (consola de Lambda)

1. **Lambda** → función **`activa-club-dev-migration-run`** → pestaña **Test**.
2. Crear un evento de prueba (por ejemplo `migrar-dev`) con el contenido `{}`:
   la función ignora el evento y lee `legacy-export.json` del bucket.
3. Pulsar **Test**.

Por CLI es equivalente (sin payload):

```bash
aws lambda invoke --function-name activa-club-dev-migration-run   --profile activa-club-dev --region us-east-1 --payload '{}'   --cli-binary-format raw-in-base64-out salida.json
```

Esperado: la respuesta de la invocación es directamente el resumen (no hay
`statusCode` ni `body`):

```json
{
  "total": 6,
  "migrated": 5,
  "skipped": 0,
  "rejected": 1,
  "rejectedItems": [{ "index": 5, "reason": "MISSING_EMAIL" }],
  "runAt": "..."
}
```

| Resultado                 | Causa probable                                                          |
| ------------------------- | ----------------------------------------------------------------------- |
| Error `VALIDATION_ERROR`  | El objeto no es JSON válido o no tiene `version`/`exportedAt`/`socios`. |
| Error `NoSuchKey`         | El archivo no está en el bucket `activa-club-dev-migration`.            |
| `AccessDenied` al invocar | Tu identidad IAM no tiene `lambda:InvokeFunction` sobre la función.     |
| Otro error                | Revisar el log group de la Lambda en CloudWatch Logs.                   |

### Autorización y auditoría

No hay endpoint ni usuario de la aplicación: solo una identidad IAM con
`lambda:InvokeFunction` puede ejecutarla. El `AuditLog` (`MIGRATION_RUN`) queda
con `actorId = migration-operator` y `actorRole = system`. Si el JSON falla, la
invocación termina en error y no se escribe nada.

## Paso 3. Verificar

Esperado en DynamoDB (consola → tabla `activa-club-dev` → **Explore items**,
filtrando `SK = PROFILE`): 5 fichas de socio con `memberStatus = MIGRATED`.
En total la tabla debe tener 31 ítems: 10 del catálogo, 20 de los 5 socios
(ficha, período, `UniqueDni` y `UniqueEmail` por socio) y 1 de auditoría.

El DNI `10000006` no debe aparecer.

## Idempotencia

Repetir el paso 2 no duplica socios: los ya migrados se cuentan en `skipped`
(condición `attribute_not_exists` sobre `UniqueDni` y `UniqueEmail`).

## Después de la migración

Cada socio crea su acceso desde `/activar-cuenta` con su DNI. Hasta entonces no
existe su usuario en Cognito. Los casos de prueba están en la
[matriz de trazabilidad](../testing/matriz-trazabilidad.md).

## Reiniciar el entorno (solo `dev`)

Script versionado: [`scripts/dev-reset.mjs`](../../scripts/dev-reset.mjs).

```bash
node scripts/dev-reset.mjs            # simulacro: muestra qué borraría
node scripts/dev-reset.mjs --apply    # respalda y borra (pide escribir BORRAR)
node scripts/dev-reset.mjs --apply --keep-cognito   # sin tocar Cognito
```

Qué hace, en este orden:

1. **DynamoDB:** borra todos los ítems **excepto** el catálogo (`RESOURCE#<id>`
   con `SK = METADATA`, gestionado por Terraform).
2. **Cognito:** borra todos los usuarios **excepto** `admin@activaclub.test`.
   Va después de DynamoDB a propósito: borrar al revés dejaría cuentas
   apuntando a una ficha inexistente.

Salvaguardas: verifica la cuenta AWS `463310123916`, exige que el catálogo tenga
exactamente 10 ítems, y pide escribir `BORRAR`. Guarda un respaldo en
`mock-data/local/` (ignorada por git).

No toca la tabla ni los índices, los buckets, los parámetros SSM de Stripe ni el
estado de Terraform.

Después de reiniciar, repetir desde el paso 1.

## Datos reales de personas del equipo

El JSON versionado (`mock-data/legacy-export.json`) es solo de datos
ficticios. Para que el equipo pruebe con sus propios correos y DNI se usa una
copia **local** en `mock-data/local/legacy-export.json`, que está en
`.gitignore` y **nunca se commitea**. Se sube a S3 con el mismo nombre
(`legacy-export.json`) siguiendo el paso 1.

## Qué NO hacer

- No versionar DNI ni correos reales: van en `mock-data/local/` (ignorada por git).
- No versionar tokens ni contraseñas. El JSON del repo es solo de datos ficticios.
- No ejecutar este procedimiento contra `prd` sin la aprobación del GitHub
  Environment `prd`.
