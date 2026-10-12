# ADR-0014 — Filtros secundarios sobre particiones existentes y nombres resueltos en lectura

- **Estado**: Aceptado
- **Fecha**: 2026-10-12
- **Decisores**: Arquitecto (rol)
- **Historia relacionada**:
  [US-052](../../scrum/historias/US-052-filtrar-socios-situacion-membresia.md),
  [US-058](../../scrum/historias/US-058-metricas-reservas-ocupacion.md),
  [US-080](../../scrum/historias/US-080-nombres-participantes-detalle-reserva.md),
  [US-081](../../scrum/historias/US-081-nombre-socio-rango-fechas-pagos-admin.md).
  Adenda de contrato: [contratos-api.md §12](../../api/contratos-api.md).

## Contexto

Al construir las pantallas de administración (US-051, US-053, US-077) contra
los endpoints existentes aparecieron cuatro límites de contrato: no se puede
listar socios por situación de membresía (deuda, vencidos, por vencer), el
listado de socios no trae vencimiento ni saldo, el detalle de una reserva y los
pagos del administrador solo traen `memberId` (la interfaz muestra "Socio del
club"), y la analítica no tiene desglose por hora.

Restricciones: tabla única on-demand con tres GSI genéricos (ADR-0003),
ninguna consulta nueva con `Scan`, pocos usuarios (padrón de cientos de socios,
demostración ante jurado), presupuesto en capa gratuita y un sprint con poco
margen.

## Decisión

1. **Filtros secundarios con `FilterExpression` sobre la partición ya
   indexada**, no con un índice nuevo. `GET /members?membershipStatus=` lee la
   partición `MEMBER#STATUS#<status>` de GSI2 (patrón #14) y filtra
   `membershipStatus` (más `outstandingBalance > 0` para `DEBT`). Para que la
   paginación siga siendo útil, el servidor encadena hasta 5 lecturas internas
   por petición y construye el cursor con el último elemento devuelto
   (contratos §12.1). El orden es el del índice (fecha de alta).
2. **Rangos de fecha solo cuando son condición de clave.** `GET /payments`
   acepta `from`/`to` porque `createdAt` ya ordena tanto la `SK` del socio como
   la `GSI2SK` del estado: el rango abarata la consulta. No se ofrece "todos los
   pagos del rango sin socio ni estado".
3. **Nombres de socios resueltos en lectura**, no denormalizados. Detalle de
   reserva y pagos del administrador agregan `{ memberId, firstName, lastName }`
   con un `GetItem` en paralelo por `memberId` distinto (proyección de nombre),
   el mismo mecanismo que ya usa `holder` en `GET /reservations?scope=all`.
4. **Analítica sin parámetros y acotada por recurso.** `GET /dashboard/admin`
   calcula reservas y ocupación con 10 + 10 consultas por recurso (GSI3 y
   bloqueos de la tabla base) sobre ventanas fijas, y lee el catálogo con diez
   `GetItem` en vez del `Scan` que usa `GET /resources`.

## Alternativas consideradas

- **GSI4 por situación de membresía** (`MEMBERSHIP#STATUS#<s>` /
  `<membershipEndsAt>#<memberId>`): daría orden por vencimiento y lecturas
  exactas. Descartada para el MVP: exige cambio de tabla en Terraform (creación
  del índice y su backfill), duplicar el almacenamiento proyectado y mantener
  la clave en **cinco** caminos de escritura (migración, activación, pago,
  webhook, proceso diario de vencimiento); un olvido deja socios mal indexados
  sin error visible. El ahorro de lectura es irrelevante con cientos de socios.
- **Sobrecargar GSI3 en el ítem `Member`** (hoy no lo usa): sin cambio de
  Terraform, pero con el mismo costo de mantenimiento y backfill que GSI4 y
  rompiendo la convención de GSI3 (recurso y tiempo). Descartada.
- **Usar el patrón #15 (`MEMBERSHIP#ACTIVE` por `endsAt`) para "por vencer"**:
  ordena por vencimiento, pero no cubre `DEBT` ni `EXPIRED` (los períodos
  vencidos salen del índice), exige leer además cada `Member` y deja tres
  caminos de código distintos para un mismo filtro. Descartada; queda como
  mejora posible solo para `EXPIRING_SOON`.
- **Copiar el nombre del socio en `Payment` y `ReservationParticipant`**:
  lectura de un solo ítem, pero necesita backfill de los datos existentes y
  agrega campos personales a más ítems. El nombre no es editable hoy, así que
  la ventaja de "foto histórica" no aporta. Descartada.
- **`BatchGetItem` para los nombres**: mismo costo en unidades de lectura que
  los `GetItem` en paralelo y una llamada menos, pero obliga a manejar
  `UnprocessedKeys` y a dar un permiso IAM nuevo a tres Lambdas. Admisible
  como optimización futura; no se exige.

## Consecuencias

- **Positivas**: ningún índice, atributo persistido, backfill ni ruta nueva;
  todos los cambios de contrato son aditivos (contratos §12.2); el costo extra
  por petición es de fracciones de centavo con el volumen del MVP.
- **Negativas**: la vista de cobranza no se ordena por vencimiento ni por saldo
  (criterio 2 de US-052 documentado así); las páginas filtradas pueden traer
  menos de `limit` elementos con cursor (el frontend debe paginar solo por
  `nextCursor`); el costo de lectura de #28 crece con el tamaño de la partición
  `ACTIVE`, no con el resultado.
- **Riesgo registrado**: `GET /resources` lista el catálogo con un `Scan` de
  toda la tabla filtrado por `PK`/`SK` (decisión de US-027/US-028). Su costo
  crece con socios, pagos y reservas, no con los diez recursos. No se cambia en
  esta adenda, pero ninguna métrica nueva debe reutilizarlo; se recomienda
  sustituirlo por `GetItem` de los `resourceId` conocidos en una historia de
  deuda técnica.
- **Disparador de revisión**: si la partición `MEMBER#STATUS#ACTIVE` supera
  ~5.000 socios, o si el producto exige ordenar la cobranza por vencimiento o
  saldo, se reabre la alternativa GSI4 con un ADR que reemplace a este.
- **Impacto**: backend (US-052, US-058, US-080, US-081); frontend (paginar por
  `nextCursor`, mostrar nombres y períodos); Terraform solo en permisos IAM
  (`GetItem` para `payments-list`; `GetItem`/`Query` de tabla base para la
  Lambda del dashboard); QA con casos de página filtrada parcial y de socio no
  resoluble; CI/CD sin cambios.
