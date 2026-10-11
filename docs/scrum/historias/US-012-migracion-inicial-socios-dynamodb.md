# US-012 — Ejecutar la migración inicial de socios hacia DynamoDB

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-012                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Tarea técnica                                           |
| Responsable         | Backend                                                 |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Crítica                                                 |
| Estimación relativa | 8                                                       |
| Dependencias        | US-011                                                  |

## Objetivo

Implementar y ejecutar la migración inicial de socios desde el JSON mock on-premise (bucket S3 de migración) hacia DynamoDB, según el flujo diseñado en US-009 y el mapeo de `docs/data/mapeo-migracion.md`, preservando socios, membresías, saldo pendiente resumido, estado legado e identificador legado, de forma idempotente y auditada. Expuesta como Lambda de invocación directa `migration-run` (antes `POST /admin/migration/run`, solo `admin`; ver nota de cambio).

## Entregable

Módulos de migración en `apps/api/src/migration/` (`transform.ts`, `repository.ts`, `run.ts`) y el handler `apps/api/src/handlers/migration/run.ts`, que leen el JSON desde el bucket S3, transforman y persisten los ítems en DynamoDB con las claves exactas de `docs/data/modelo-dynamodb.md`, y devuelven el contrato de salida de `mapeo-migracion.md` §6.

## Valor de negocio

La migración es el primer entregable que demuestra el objetivo del proyecto: llevar la información del sistema on-premise a AWS. Sin socios migrados no hay cuentas que activar, iniciar sesión ni operar. Preservar el identificador legado garantiza trazabilidad hacia el sistema anterior.

## Criterios de aceptación

1. La Lambda `migration-run`, de invocación directa (sin API Gateway ni payload; autorización IAM `lambda:InvokeFunction`), lee `legacy-export.json` del bucket S3 de migración y devuelve el contrato de salida (`total`, `migrated`, `skipped`, `rejected`, `rejectedItems`, `runAt`).
2. Por cada socio válido se escriben, en una transacción idempotente, los ítems `Member`, `UniqueDni`, `UniqueEmail` y `MembershipPeriod` con las claves y atributos de `modelo-dynamodb.md`.
3. Se migran únicamente socios, membresías, saldo pendiente resumido y estado legado; no se crean pagos ni reservas históricas (RN-MIG-03/04).
4. Cada socio migrado conserva su `legacyId` como identificador legado (RN-MIG-05) y queda con `origin=MIGRATED`, `memberStatus=MIGRATED` y `cognitoSub=null`.
5. `membershipStatus` se deriva según la tabla de `mapeo-migracion.md` §3 en zona `America/Lima`.
6. La migración es reejecutable: un socio ya migrado (misma `UNIQ#DNI`) se omite sin duplicar (RT-10, RN-ACT-03).
7. Registros inválidos (sin `dni`, `email` o `membresia`) se rechazan y se reportan en el resumen sin abortar el lote.
8. Se emite un `AuditLog` `action=MIGRATION_RUN` con el resumen de la corrida.
9. Se valida entrada con los esquemas de `packages/validation`; no se inventan campos fuera del contrato de entrada.
10. No se almacenan contraseñas ni datos sensibles fuera de lo modelado.

## Casos alternativos / excepciones

- Envoltura del JSON inválida (falta `socios` o `version`): se rechaza la corrida completa con error de validación reportado, sin escrituras parciales.
- Registro con `dni` o `email` duplicado dentro del mismo lote: se procesa el primero y los siguientes se reportan como omitidos/rechazados según política.
- Si el mapeo real del JSON difiere del contrato de entrada, se ajusta `mapeo-migracion.md` antes de implementar (norma: no inventar campos).

## Trazabilidad

- Épica: EP-02
- Reglas: RN-MIG-01..06, RN-ACT-03.
- Depende de: US-011 (endpoint admin provisionado). Diseño previo: US-009.
- Habilita: US-013 (activación requiere socios migrados).

## Nota de cambio (2026-10-11)

Por decisión del Product Owner ([ADR-0012](../../architecture/adr/ADR-0012-migracion-lambda-invocacion-directa.md)) la carga inicial dejó de ser el endpoint `POST /admin/migration/run` (rol `admin`) y es una Lambda de invocación directa (`activa-club-<env>-migration-run`), sin API Gateway ni payload. Los criterios 2 a 10 no cambian. El criterio 1 se reformuló: ya no responde 202 HTTP sino que devuelve el resumen como resultado de la invocación, falla visiblemente si el JSON no existe o es inválido, y audita con `actorId = migration-operator`, `actorRole = system`.
