# Runbook: carga inicial de socios en `dev` (migración)

Procedimiento manual y repetible para cargar los socios del "sistema
on-premise" en el entorno `dev`. Lo ejecuta una persona (no el CD) porque
escribe datos de negocio. Referencias: [mapeo-migracion.md](../data/mapeo-migracion.md)
y el contrato `POST /admin/migration/run` en
[contratos-api.md](../api/contratos-api.md).

## Qué se carga y qué no

| Dato                                            | Cómo entra                                      |
| ----------------------------------------------- | ----------------------------------------------- |
| Catálogo de instalaciones (10 ítems `METADATA`) | `terraform apply` (ADR-0010). **No** va aquí.   |
| Socios, membresía vigente y saldo pendiente     | **Este runbook** (JSON en S3 + endpoint admin). |
| Reservas, pagos, invitados, bloqueos, auditoría | Se generan usando la aplicación.                |
| Cuentas de acceso (Cognito) de los socios       | Cada socio las crea al activar su cuenta (DNI). |

## Datos del entorno

| Elemento           | Valor                                                           |
| ------------------ | --------------------------------------------------------------- |
| Cuenta / región    | `463310123916` / `us-east-1` (perfil AWS `activa-club-dev`)     |
| Bucket             | `activa-club-dev-migration`                                     |
| Objeto             | **`legacy-export.json`** (el nombre es fijo, lo lee el handler) |
| API                | `https://tsbus7d8pe.execute-api.us-east-1.amazonaws.com/dev`    |
| User Pool / Client | `us-east-1_qTDbzVP5a` / `602agaeln1fltp67qbkkkao9a5`            |
| Rol requerido      | `admin` (usuario `admin@activaclub.test`)                       |

## Archivos del procedimiento (dentro del repo)

| Archivo                                                                                    | Para qué sirve                                            |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [`mock-data/legacy-export.json`](../../mock-data/legacy-export.json)                       | Datos ficticios de socios. Se sube **tal cual** a S3.     |
| [`mock-data/migration-run.test-event.json`](../../mock-data/migration-run.test-event.json) | Evento de prueba para disparar la migración desde Lambda. |

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

1. **Lambda** → función **`activa-club-dev-admin-migration-run`** → pestaña **Test**.
2. Crear un evento de prueba (por ejemplo `migrar-dev`) y pegar el contenido de
   `mock-data/migration-run.test-event.json`.
3. Pulsar **Test**.

Esperado: `statusCode` `202` y, dentro de `body`:

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

| Resultado         | Causa probable                                                  |
| ----------------- | --------------------------------------------------------------- |
| `403`             | El evento de prueba no trae `"cognito:groups": "[admin]"`.      |
| `400`             | El objeto no es JSON válido o no se llama `legacy-export.json`. |
| Error `NoSuchKey` | El archivo no está en el bucket `activa-club-dev-migration`.    |
| Otro error        | Revisar el log group de la Lambda en CloudWatch Logs.           |

### Qué prueba y qué no esta vía

El evento de prueba invoca la Lambda directamente, sin pasar por API Gateway.
Prueba la lógica de migración, pero **no** el authorizer de Cognito ni el
rechazo con `403` a un usuario sin rol `admin` (eso se verifica en el E2E). El
`AuditLog` queda con el actor `admin-consola-dev`.

Vía alternativa por API (con token real del admin):
`POST https://tsbus7d8pe.execute-api.us-east-1.amazonaws.com/dev/admin/migration/run`
con `Authorization: Bearer <IdToken>` (grupo `admin`). El `IdToken` se obtiene
iniciando sesión en la web como `admin@activaclub.test`; no se versiona ni se
comparte.

## Paso 3. Verificar

Esperado en DynamoDB (consola → tabla `activa-club-dev` → **Explore items**,
filtrando `SK = PROFILE`): 5 fichas de socio con `memberStatus = MIGRATED`.
En total la tabla debe tener 31 ítems: 10 del catálogo, 20 de los 5 socios
(ficha, período, `UniqueDni` y `UniqueEmail` por socio) y 1 de auditoría.

El DNI `10000006` no debe aparecer.

## Idempotencia

Repetir el paso 4 no duplica socios: los ya migrados se cuentan en `skipped`
(condición `attribute_not_exists` sobre `UniqueDni` y `UniqueEmail`).

## Después de la migración

Cada socio crea su acceso desde `/activar-cuenta` con su DNI. Hasta entonces no
existe su usuario en Cognito. Los casos de prueba están en la
[matriz de trazabilidad](../testing/matriz-trazabilidad.md).

## Reiniciar el entorno (solo `dev`)

1. Borrar primero los ítems de DynamoDB de socios, pagos, períodos,
   transiciones, auditoría, reservas y participantes. **Conservar** los 10
   ítems `RESOURCE#<id> / METADATA` (catálogo de Terraform).
2. Después borrar los usuarios de Cognito (nunca al revés: quedarían cuentas
   apuntando a una ficha inexistente). Conservar el usuario admin.
3. No tocar el bucket de estado de Terraform, los parámetros SSM de Stripe ni
   el bucket `web`.
4. Repetir desde el paso 1.

## Qué NO hacer

- No subir datos reales de socios: el entorno `dev` usa solo datos ficticios.
- No versionar tokens ni contraseñas. El JSON del repo es solo de datos ficticios.
- No ejecutar este procedimiento contra `prd` sin la aprobación del GitHub
  Environment `prd`.
