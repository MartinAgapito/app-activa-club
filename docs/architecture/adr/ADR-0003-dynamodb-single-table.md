# ADR-0003 — DynamoDB single-table design

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002, US-003

## Contexto

El MVP maneja varias entidades relacionadas (socios, membresías, pagos,
reservas, participantes/invitados, recursos, notificaciones, auditoría) con
patrones de acceso conocidos: activación por DNI, resolución por `cognitoSub`,
detección de cruces por recurso y por participante, historial por socio,
métricas por estado. DynamoDB es la base acordada y debe operar a bajo costo.

## Decisión

Se adopta **diseño single-table** (una sola tabla DynamoDB) con **capacidad
on-demand** (pay-per-request).

- Claves genéricas `PK` / `SK` y **hasta tres GSI genéricos** (`GSI1`, `GSI2`,
  `GSI3`) sobrecargados por tipo de entidad. El detalle de claves, índices y
  patrones de acceso está en [modelo-dynamodb.md](../../data/modelo-dynamodb.md).
- Cada item lleva `entityType` para discriminar el tipo.
- **Unicidad transaccional** (DNI, email, idempotencia de pago) mediante ítems
  de "constraint" y `TransactWriteItems` con condiciones (`attribute_not_exists`).
- **TTL** para ítems efímeros (p. ej. claves de idempotencia).

Justificación del single-table frente a múltiples tablas:

1. **Costo y operación**: una sola tabla on-demand minimiza recursos a
   aprovisionar y monitorear; costo cercano a cero en reposo.
2. **Patrones de acceso acotados y conocidos**: se resuelven con `PK/SK` +
   3 GSI, sin necesidad de joins ni de múltiples tablas.
3. **Transacciones**: unicidad de DNI/email e idempotencia de pagos requieren
   escrituras condicionales atómicas, más simples dentro de una tabla.
4. **Simplicidad de IaC/permisos**: una tabla, un conjunto de permisos IAM.

## Alternativas consideradas

- **Múltiples tablas (una por entidad)**: más intuitivo y familiar, pero
  multiplica recursos, permisos y el esfuerzo de mantener consistencia
  transaccional entre tablas. Para el volumen del MVP no aporta beneficio y sí
  complejidad operativa. Rechazada.
- **Base relacional (RDS/Aurora Serverless)**: contradice el stack acordado
  (DynamoDB) y tiene costo base mayor por estar siempre encendida o por el
  arranque en frío de Aurora Serverless v2. Rechazada.

## Consecuencias

- **Positivas**: costo mínimo, transacciones simples, un único punto de gobierno
  del modelo, permisos IAM acotados.
- **Negativas**: el modelo single-table es menos intuitivo; exige disciplina
  para no "inventar" claves fuera de lo documentado y cuidado al diseñar los GSI.
  Algunas métricas de analytics podrían requerir agregación en aplicación.
- **Riesgo y mitigación**: particiones calientes en índices de estado/expiración
  con muchos usuarios; para el MVP (pocos usuarios) es aceptable. Documentado en
  [riesgos-tecnicos.md](../riesgos-tecnicos.md).
- **Impacto**:
  - *Backend (US-009)*: repositorio de acceso a datos centrado en una tabla;
    helpers de construcción de claves según el modelo documentado.
  - *Terraform (US-004)*: una tabla DynamoDB on-demand con 3 GSI y TTL.
  - *QA*: pruebas de reglas críticas (cruces, unicidad, idempotencia) contra los
    patrones de acceso definidos.
