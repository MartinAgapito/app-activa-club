# ADR-0008 — Manejo de errores, logging, auditoría y observabilidad

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002

## Contexto

Las normas de ingeniería exigen validación de entrada, autorización por rol y
**logging estructurado**. Se necesita un manejo de errores consistente para el
contrato de API, trazabilidad de acciones administrativas (auditoría) y
observabilidad, todo con bajo costo. El stack fija **CloudWatch**.

## Decisión

### Manejo de errores (contrato)
Formato de error estándar único para toda la API (ver
[contratos-api.md](../../api/contratos-api.md)):

```json
{ "error": { "code": "STRING_ENUM", "message": "texto", "details": [], "requestId": "uuid" } }
```

- Códigos de estado: `400` validación, `401` no autenticado, `403` sin permiso,
  `404` no encontrado, `409` conflicto (unicidad/cruces/estado), `422` regla de
  negocio no satisfecha, `429` límite, `500` error interno.
- Errores esperados se mapean a códigos de dominio (`code`); nunca se filtran
  trazas ni datos sensibles al cliente.

### Logging estructurado
- Cada Lambda emite logs **JSON** a CloudWatch con campos mínimos: `timestamp`,
  `level`, `requestId`, `route`, `actorSub`, `role`, `entityType`, `action`,
  `outcome`, `latencyMs`. Sin PII innecesaria, sin tarjetas ni secretos.
- `requestId` se propaga desde API Gateway y se devuelve en el error para
  correlación.

### Auditoría (RN-ADM)
- Las **acciones administrativas** relevantes (aprobar/rechazar socio, aprobar/
  rechazar reserva, mantenimiento de recurso, envío de notificaciones, ejecución
  de migración) se persisten como ítems `AuditLog` en DynamoDB
  (`entityType = "AuditLog"`), con `actorId`, `action`, `targetType`, `targetId`,
  `timestamp` y metadatos. Consultables cronológicamente (ver modelo de datos).
- El log operativo (CloudWatch) es para diagnóstico; la auditoría (DynamoDB) es
  registro de negocio consultable.

### Observabilidad
- **Métricas** por endpoint (invocaciones, errores, duración) nativas de Lambda
  en CloudWatch.
- **Alarmas** mínimas para la demo: tasa de errores 5xx y errores de la Lambda de
  pagos.
- Retención de logs acotada (p. ej. 14 días) para contener costo.

## Alternativas consideradas

- **Stack de observabilidad externo (Datadog/New Relic)**: costo y complejidad
  innecesarios para el MVP. Rechazada; CloudWatch es suficiente.
- **Auditoría solo en logs de CloudWatch**: los logs son efímeros y poco
  consultables como registro de negocio. Rechazada; la auditoría vive en DynamoDB.
- **X-Ray/tracing distribuido**: útil a futuro, sobrearquitectura ahora. Se deja
  como evolución.

## Consecuencias

- **Positivas**: contrato de error uniforme, trazabilidad de acciones admin,
  diagnóstico correlacionable por `requestId`, costo controlado.
- **Negativas**: disciplina para emitir logs estructurados y escribir auditoría en
  cada acción sensible; la auditoría consume capacidad de la tabla (marginal).
- **Impacto**:
  - *Backend (US-009)*: logger estructurado compartido + helper de respuesta de
    error + escritura de `AuditLog` en acciones admin.
  - *Terraform (US-004)*: grupos de logs con retención, alarmas básicas.
  - *QA*: verificar formato de error y creación de auditoría por acción admin.
  - *Contratos (US-003)*: formato de error y tipo `AuditLog` en shared-types.
