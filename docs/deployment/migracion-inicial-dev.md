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

## Precondiciones

1. Perfil AWS configurado: `export AWS_PROFILE=activa-club-dev AWS_DEFAULT_REGION=us-east-1`.
2. Tabla `activa-club-dev` sin socios (solo los 10 ítems `METADATA`). Si hay datos
   de pruebas anteriores, limpiarlos antes (ver "Reiniciar el entorno").
3. Contraseña del usuario admin. **No se comparte ni se versiona.**

## Paso 1. Crear el archivo `legacy-export.json`

Datos 100 % ficticios, un caso por socio. Guardar con ese nombre exacto:

```json
{
  "version": "1",
  "exportedAt": "2026-10-11T00:00:00Z",
  "socios": [
    {
      "legacyId": "SOC-PRUEBA-001",
      "dni": "10000001",
      "nombres": "Ana",
      "apellidos": "Torres Vega",
      "email": "ana.torres.prueba@example.com",
      "telefono": "999000001",
      "membresia": {
        "tipo": "ANNUAL",
        "inicio": "2026-01-15",
        "fin": "2027-01-15",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 0
    },
    {
      "legacyId": "SOC-PRUEBA-002",
      "dni": "10000002",
      "nombres": "Luis",
      "apellidos": "Ramírez Paz",
      "email": "luis.ramirez.prueba@example.com",
      "membresia": {
        "tipo": "MONTHLY",
        "inicio": "2026-09-10",
        "fin": "2026-11-10",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 5000
    },
    {
      "legacyId": "SOC-PRUEBA-003",
      "dni": "10000003",
      "nombres": "Carla",
      "apellidos": "Núñez Solís",
      "email": "carla.nunez.prueba@example.com",
      "membresia": {
        "tipo": "MONTHLY",
        "inicio": "2026-09-15",
        "fin": "2026-10-15",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 0
    },
    {
      "legacyId": "SOC-PRUEBA-004",
      "dni": "10000004",
      "nombres": "Diego",
      "apellidos": "Flores Reyes",
      "email": "diego.flores.prueba@example.com",
      "membresia": {
        "tipo": "MONTHLY",
        "inicio": "2026-08-01",
        "fin": "2026-09-01",
        "estadoLegado": "VENCIDA"
      },
      "saldoPendiente": 0
    },
    {
      "legacyId": "SOC-PRUEBA-005",
      "dni": "10000005",
      "nombres": "Eva",
      "apellidos": "Castro Lima",
      "email": "eva.castro.prueba@example.com",
      "membresia": {
        "tipo": "ANNUAL",
        "inicio": "2026-05-01",
        "fin": "2027-05-01",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 0
    },
    {
      "legacyId": "SOC-PRUEBA-006",
      "dni": "10000006",
      "nombres": "Sin Correo",
      "apellidos": "Prueba",
      "membresia": {
        "tipo": "MONTHLY",
        "inicio": "2026-09-01",
        "fin": "2026-11-01",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 0
    }
  ]
}
```

Si se repite el procedimiento en otra fecha, ajustar las fechas a "hoy": Carla
debe vencer en 7 días o menos (para `EXPIRING_SOON`) y Diego debe tener `fin`
anterior a hoy (para `EXPIRED`). Luis tiene deuda, así que su estado es `DEBT`
sin importar la fecha.

## Paso 2. Subir el archivo al bucket

```bash
aws s3 cp legacy-export.json s3://activa-club-dev-migration/legacy-export.json
aws s3 ls s3://activa-club-dev-migration/
```

Esperado: el objeto aparece listado.

## Paso 3. Obtener el token del admin

```bash
aws cognito-idp initiate-auth \
  --client-id 602agaeln1fltp67qbkkkao9a5 \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin@activaclub.test,PASSWORD='<contraseña>' \
  --query 'AuthenticationResult.IdToken' --output text
```

El `IdToken` dura 1 hora. Guardarlo en una variable de la sesión (`TOKEN=...`);
no pegarlo en chats, tickets ni commits. Alternativa: iniciar sesión en la web
como admin y copiar el token desde las herramientas del navegador.

## Paso 4. Ejecutar la migración

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  https://tsbus7d8pe.execute-api.us-east-1.amazonaws.com/dev/admin/migration/run
```

Esperado: HTTP `202` con el resumen:

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

| Respuesta | Causa probable                                                     |
| --------- | ------------------------------------------------------------------ |
| `401`     | Token vencido o mal copiado: repetir el paso 3.                    |
| `403`     | El usuario no pertenece al grupo `admin`.                          |
| `400`     | El objeto no es JSON válido o no se llama `legacy-export.json`.    |
| `5xx`     | Revisar el log group de la Lambda de migración en CloudWatch Logs. |

## Paso 5. Verificar

```bash
aws dynamodb scan --table-name activa-club-dev \
  --filter-expression "SK = :s" --expression-attribute-values '{":s":{"S":"PROFILE"}}' \
  --projection-expression "dni,memberStatus,membershipStatus,outstandingBalance" --output table
```

Esperado (5 filas, `memberStatus = MIGRATED`):

| DNI      | membershipStatus |
| -------- | ---------------- |
| 10000001 | `ACTIVE`         |
| 10000002 | `DEBT`           |
| 10000003 | `EXPIRING_SOON`  |
| 10000004 | `EXPIRED`        |
| 10000005 | `ACTIVE`         |

El DNI `10000006` no debe aparecer (rechazado por falta de correo).

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
- No versionar tokens, contraseñas ni el archivo con datos reales.
- No ejecutar este procedimiento contra `prd` sin la aprobación del GitHub
  Environment `prd`.
