# Mapeo de migración on-premise → DynamoDB — Activa Club

> Cómo se transforma el JSON mock del sistema on-premise
> ([mock-data/](../../mock-data/)) en ítems de la tabla
> [DynamoDB](./modelo-dynamodb.md). Cubre RN-MIG-01..06. Solo se migran socios,
> membresías, saldo pendiente resumido y estado legado (RN-MIG-03); no pagos
> históricos detallados ni reservas históricas (RN-MIG-04).

## 1. Estructura esperada del JSON on-premise (contrato de entrada)

El archivo es un objeto con un arreglo `socios`. Cada socio del on-premise:

```json
{
  "version": "1",
  "exportedAt": "2026-07-01T00:00:00Z",
  "socios": [
    {
      "legacyId": "SOC-000123",
      "dni": "45678912",
      "nombres": "María",
      "apellidos": "Quispe Rojas",
      "email": "maria.quispe@example.com",
      "telefono": "999888777",
      "membresia": {
        "tipo": "ANNUAL",
        "inicio": "2026-01-15",
        "fin": "2027-01-15",
        "estadoLegado": "ACTIVA"
      },
      "saldoPendiente": 0
    }
  ]
}
```

> Este es el **contrato de entrada** de la migración. Si el JSON real difiere, se
> ajusta el mapeo aquí antes de implementar (norma: no inventar campos).

### Campos de entrada

| Campo JSON               | Tipo                | Obligatorio | Nota                                      |
| ------------------------ | ------------------- | ----------- | ----------------------------------------- |
| `legacyId`               | string              | sí          | Identificador legado (RN-MIG-05)          |
| `dni`                    | string              | sí          | Clave de unicidad e identidad (RN-ACT-02) |
| `nombres`                | string              | sí          | → `firstName`                             |
| `apellidos`              | string              | sí          | → `lastName`                              |
| `email`                  | string              | sí          | → `email` (login)                         |
| `telefono`               | string              | no          | → `phone`                                 |
| `membresia.tipo`         | `MONTHLY`\|`ANNUAL` | sí          | → `membershipType`                        |
| `membresia.inicio`       | fecha               | sí          | → `membershipStartedAt`                   |
| `membresia.fin`          | fecha               | sí          | → `membershipEndsAt`                      |
| `membresia.estadoLegado` | string              | sí          | Estado legado resumido                    |
| `saldoPendiente`         | number (céntimos)   | sí          | → `outstandingBalance`                    |

## 2. Transformación por socio

Por cada socio del JSON se escriben, en una **transacción** por socio
(idempotente), los siguientes ítems:

1. **Member** (`PK=MEMBER#<memberId>`, `SK=PROFILE`)
   - `memberId`: ULID nuevo generado en la migración.
   - `legacyId`: del JSON (trazabilidad, RN-MIG-05).
   - `origin`: `MIGRATED`.
   - `memberStatus`: `MIGRATED` (aún no ha activado su cuenta digital).
   - `cognitoSub`: `null` (se completa al activar con DNI).
   - `membershipType`, `membershipStartedAt`, `membershipEndsAt`: de `membresia`.
   - `membershipStatus`: derivado (ver tabla 3) a partir de `estadoLegado`,
     `fin` y `saldoPendiente`.
   - `outstandingBalance`: `saldoPendiente`.
   - `autoRenew`: `false`.
   - `GSI2PK=MEMBER#STATUS#MIGRATED`.
2. **UniqueDni** (`PK=UNIQ#DNI#<dni>`) con `memberId`, condicional
   `attribute_not_exists` → garantiza no duplicar socios al reejecutar (RT-10) y
   RN-ACT-03.
3. **UniqueEmail** (`PK=UNIQ#EMAIL#<emailLower>`) con `memberId`, condicional.
4. **MembershipPeriod** (`SK=MEMBERSHIP#<startedAt>#<membershipId>`) con el
   período migrado; `GSI2PK=MEMBERSHIP#ACTIVE`, `GSI2SK=<endsAt>` si sigue vigente.

> No se crean ítems de Payment ni de Reservation en la migración (RN-MIG-04).

## 3. Derivación de `membershipStatus`

Se calcula en zona `America/Lima` a la fecha de migración:

| Condición                           | `membershipStatus` |
| ----------------------------------- | ------------------ |
| `saldoPendiente > 0`                | `DEBT`             |
| `fin < hoy`                         | `EXPIRED`          |
| `fin` dentro de los próximos 7 días | `EXPIRING_SOON`    |
| en otro caso                        | `ACTIVE`           |

`estadoLegado` se conserva como referencia en logs/auditoría, pero el estado
operativo del sistema es el derivado (RN-MIG-06: DynamoDB es la fuente operativa).

## 4. Idempotencia y errores

- La migración es **reejecutable**: la condición `attribute_not_exists` sobre
  `UNIQ#DNI#<dni>` evita duplicar un socio ya migrado; ese socio se omite (o se
  actualiza según política, por defecto se omite).
- Registros inválidos (falta `dni`, `email` o `membresia`) se **rechazan** y se
  reportan en el resumen, sin abortar el lote completo.
- Se emite un ítem **AuditLog** `action=MIGRATION_RUN` con el resumen
  (`total`, `migrados`, `omitidos`, `rechazados`).

## 5. Origen y ejecución

- El JSON reside en el bucket S3 de migración
  (`activa-club-<env>-migration`, [ADR-0005](../architecture/adr/ADR-0005-s3-migracion-activos-hosting.md)).
- La ejecuta una **Lambda operacional** (no un endpoint público) o el endpoint
  admin `POST /admin/migration/run` (ver [contratos-api.md](../api/contratos-api.md)),
  restringido a `admin`.

## 6. Resultado de migración (contrato de salida)

```json
{
  "total": 120,
  "migrated": 118,
  "skipped": 1,
  "rejected": 1,
  "rejectedItems": [{ "index": 57, "reason": "MISSING_EMAIL" }],
  "runAt": "2026-07-09T16:00:00Z"
}
```

## 7. Implementación (US-009)

El scaffolding de este flujo vive en `apps/api/src/migration/` (ver
[apps/api/README.md](../../apps/api/README.md) §6), separado en tres módulos
de responsabilidad única:

- `transform.ts` (puro): valida cada socio con `legacyMemberSchema` de
  `packages/validation` y produce los 4 ítems de §2 con las claves exactas de
  [modelo-dynamodb.md](./modelo-dynamodb.md) §3. Deriva `membershipStatus`
  según la tabla de §3 en zona `America/Lima`.
- `repository.ts`: persiste los 4 ítems en una `TransactWriteItems` con
  `attribute_not_exists(PK)` sobre `UniqueDni`/`UniqueEmail` (idempotencia,
  RT-10 y §4).
- `run.ts`: orquesta lectura → validación de envoltura → validación por socio
  (rechazo individual sin abortar el lote, §4) → transformación → persistencia
  → `AuditLog` (`MIGRATION_RUN`) con el resumen de §6.

Expuesto por `POST /admin/migration/run`
(`apps/api/src/handlers/admin/run-migration.ts`, solo `admin`), que lee el
JSON desde el bucket S3 de migración (ADR-0005).

**Nota de diseño pendiente de confirmar con Arquitectura**: al migrar, el
ítem `Member` se escribe sin `GSI1PK`/`GSI1SK` (resolución por `cognitoSub`),
ya que el socio migrado todavía no tiene cuenta digital; ese índice se
completaría al activar la cuenta (`POST /activation/complete`, Sprint 1).
`modelo-dynamodb.md` §3.1 no cubre explícitamente este caso.
