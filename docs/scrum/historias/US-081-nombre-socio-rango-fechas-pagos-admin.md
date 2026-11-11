# US-081 — Nombre del socio y rango de fechas en la consulta de pagos del administrador (servidor)

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-081                                     |
| Épica               | [EP-06](../epicas/EP-06-administracion.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + DevOps                           |
| Fase                | MVP                                        |
| Sprint              | Sprint 5                                   |
| Estado              | Ready                                      |
| Prioridad           | Media                                      |
| Estimación relativa | 3                                          |
| Dependencias        | US-025 (servidor de pagos implementado)    |

## Historia

Como **administrador**, quiero **ver el nombre del socio en cada pago y acotar la consulta a un rango de fechas**, para **atender un reclamo ("me cobraron el martes") sin abrir el detalle de cada socio ni recorrer todo el historial**.

## Contrato de API

`GET /payments?memberId=&status=&from=&to=&cursor=&limit=` y `GET /payments/{paymentId}`, según la adenda del 2026-10-12 de `docs/api/contratos-api.md` §5 y §12. Patrones de acceso #29 (rango sobre `createdAt` como condición de clave) y #31 (nombres por `GetItem` en paralelo) del modelo de datos; decisión en [ADR-0014](../../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md).

- Para `admin`, cada pago agrega `member: { memberId, firstName, lastName } | null`. El rol `member` no recibe ese campo.
- `from` (inclusivo) y `to` (exclusivo) son opcionales y válidos para ambos roles; para `admin` siguen exigiéndose `memberId` o `status`.

## Reglas de negocio

RN-ADM-07 (consultar pagos), RN-ADM-03, RN-PAG-08 (sin datos de tarjeta).

## Valor de negocio

La pantalla de pagos del administrador (US-053) ya existe, pero muestra cada fila sin el nombre del socio y no permite acotar por fecha: para identificar un cobro hay que abrir socio por socio. Es la diferencia entre una herramienta de consulta y una lista de identificadores.

## Precondiciones

- Sesión con rol `admin` (nombre) o cualquier rol autenticado (rango).

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Para `admin`, cada elemento de `GET /payments` y la respuesta de `GET /payments/{paymentId}` incluyen `member` con `memberId`, `firstName` y `lastName`; un socio no resoluble da `member: null` y la respuesta sigue siendo 200.
2. Para `member`, ambas respuestas son idénticas a las actuales (sin `member`).
3. `member` nunca incluye DNI, correo, teléfono ni estado de membresía; los pagos siguen sin `idempotencyKey`, `failureReason`, `stripePaymentMethodId` ni datos de tarjeta.
4. Los `memberId` repetidos de una página se resuelven una sola vez (≤ 100 lecturas por clave en paralelo); con filtro `memberId`, una sola lectura.
5. `from`/`to` filtran por `createdAt` en la ventana `[from, to)`, como condición de clave (sin `FilterExpression`), tanto por socio como por estado, combinables con `status`, `memberId` y la paginación existente.
6. `from >= to`, o una fecha no ISO-8601 → 400 `VALIDATION_ERROR`. Para `admin`, `from`/`to` sin `memberId` ni `status` → 400 `VALIDATION_ERROR` (el rango no habilita listar todos los pagos).
7. `from`/`to` con offset (`-05:00`) se normalizan a UTC con el formato de `createdAt` antes de comparar: un pago creado a las 23:30 de Lima del 30 de setiembre queda fuera de `from=2026-10-01T00:00:00-05:00`.
8. Terraform: la Lambda `payments-list` recibe `dynamodb:GetItem` sobre la tabla (hoy solo tiene `Query`); ningún otro permiso cambia. `payments-get-by-id` ya lo tiene.
9. `packages/shared-types` (`PaymentSummary` con `member?: MemberNameSummary | null`) y `packages/validation` (`listPaymentsQuerySchema` con `from`, `to` y la regla `from < to`) se actualizan.

## Casos alternativos / excepciones

- **Rango sin pagos**: lista vacía, 200.
- **"Todos los pagos del mes" sin estado ni socio**: no se ofrece (contratos §5, ADR-0014); la pantalla elige un estado.
- **Mostrar el nombre y el selector de fechas en la interfaz**: ajuste de `/admin/membresias` (US-053) como tarea de frontend aparte; retira la nota del criterio 2 de US-053 ("no se exige el nombre").

## Sugerencia de pruebas funcionales

- AD-03 extendido: filtro `FAILED` → cada fila con el nombre del socio.
- Mismo socio con tres pagos en la página → una sola lectura de su perfil.
- Rango de un día con pagos en el borde (23:59 y 00:00 de Lima).
- `member` consulta su historial con rango → sin campo `member`, solo sus pagos.
- T-04: ninguna respuesta contiene datos de tarjeta.

## Trazabilidad

- Épica: EP-06
- Reglas: RN-ADM-07, RN-ADM-03, RN-PAG-08.
- Contrato: `docs/api/contratos-api.md` §5 y §12; modelo de datos patrones #29 y #31; ADR-0014.
- Casos de prueba: AD-03, T-04.
- Depende de: US-025.
- Habilita: nombre y rango de fechas en US-053.

## Historial de cambios

- 2026-10-12: Criterio 8 (Terraform) aplicado en `infrastructure/terraform/environments/dev/main.tf`: `payments-list` recibe `dynamodb:GetItem` solo sobre el ARN de la tabla (sin índices, `Scan` ni escrituras). Pendiente la lógica de servidor, los tipos compartidos y la validación (criterios 1 a 7 y 9).
