# EP-06 — Administración

| Campo            | Valor               |
| ---------------- | ------------------- |
| ID               | EP-06               |
| Tipo             | Épica               |
| Fase             | MVP                 |
| Estado           | Planificada         |
| Dependencias     | EP-02, EP-03, EP-05 |
| Sprint principal | Sprint 5            |

## Descripción

Completar la consola del administrador con lo que todavía falta para **gestionar socios** y **consultar pagos**: el padrón completo por estado con el detalle de membresía y deuda de cada socio, la vista de cobranza (socios con deuda, vencidos o por vencer) y la consulta de pagos de cualquier socio.

Buena parte de las capacidades de administración del MVP (RN-ADM-01..08) ya se entregó dentro de las épicas funcionales, junto a la funcionalidad que administran. Esta épica **no las rehace**: cierra los huecos que quedaron y deja explícito dónde vive cada capacidad.

Estado real del código al planificar (verificado en `apps/api` y `apps/web`):

- El servidor ya expone `GET /members?status=` (obligatorio el filtro por `memberStatus`), `GET /members/{memberId}`, `GET /members/lookup?dni=` y `GET /payments` con filtros de administrador (US-017, US-025, ADR-0009).
- Las pantallas `/admin/socios` (`MembersManagementPage`) y `/admin/membresias` (`MembershipsAdminPage`) son placeholders "en construcción". La única vista de socios que existe es la de solicitudes pendientes (`/admin/solicitudes`).

## Valor de negocio

El administrador hoy puede aprobar solicitudes, decidir reservas y gestionar instalaciones, pero **no puede responder la pregunta más común en ventanilla**: "¿este socio está al día?". Tampoco puede ver a los socios migrados, que son la mayoría del padrón, ni revisar un cobro sin entrar al panel de Stripe. EP-06 le da esa visibilidad sobre datos que el sistema ya tiene.

## Objetivos de la épica

- **Padrón de socios** por estado, con búsqueda por DNI y detalle de membresía y deuda (US-051).
- **Vista de cobranza**: socios con deuda, con la membresía vencida o por vencer (US-052).
- **Consulta de pagos** de cualquier socio, por estado o por socio (US-053).

## Capacidades de administración del MVP y dónde se entregan

- RN-ADM-01 (gestionar socios migrados y nuevos): migración y aprobación en EP-02; **consulta del padrón en US-051** (esta épica). Ver pregunta abierta 1 sobre "gestionar".
- RN-ADM-02 (aprobar o rechazar solicitudes): EP-02, US-017. Entregada.
- RN-ADM-03 (consultar estados de membresía y deudas): **US-051 y US-052** (esta épica).
- RN-ADM-04 (recursos, aforo, horarios y mantenimiento): EP-04, US-035 y US-036. Entregada.
- RN-ADM-05 (aprobar o rechazar reservas de parrillas y salón): EP-04, US-034. Entregada.
- RN-ADM-06 (publicar notificaciones): EP-05, US-048 y US-049.
- RN-ADM-07 (consultar pagos y reservas): reservas en EP-04 (US-036); **pagos en US-053** (esta épica).
- RN-ADM-08 (dashboards y métricas): EP-07.

## Historias asociadas

| ID                                                                     | Título                                                                                  | Responsable        | Depende de     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | -------------- |
| [US-051](../historias/US-051-consultar-socios-admin.md)                | Consultar los socios y su situación de membresía                                        | Frontend           | US-017         |
| [US-052](../historias/US-052-filtrar-socios-situacion-membresia.md)    | Filtrar socios con deuda, vencidos o por vencer                                         | Backend + Frontend | US-038, US-051 |
| [US-053](../historias/US-053-consultar-pagos-socios-admin.md)          | Consultar los pagos de los socios                                                       | Frontend           | US-025         |
| [US-081](../historias/US-081-nombre-socio-rango-fechas-pagos-admin.md) | Nombre del socio y rango de fechas en la consulta de pagos del administrador (servidor) | Backend + DevOps   | US-025         |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- El administrador consulta el padrón completo por estado de socio, encuentra a un socio por DNI y ve su tipo y estado de membresía, su vencimiento y su saldo pendiente (RN-ADM-01, RN-ADM-03).
- El administrador obtiene la lista de socios con deuda, vencidos o por vencer, con los mismos criterios que los segmentos de notificación de EP-05.
- El administrador consulta los pagos de cualquier socio o por estado, sin ver nunca datos de tarjeta ni secretos (RN-ADM-07, RN-PAG-08).
- Ninguna consulta del administrador se resuelve con un `Scan` completo de la tabla.
- Toda la autorización es por rol en el servidor; un `member` no accede a ninguna de estas consultas ni pantallas.
- Los casos AD-01, AD-02 y AD-03 de la matriz de trazabilidad quedan cubiertos por interfaz.
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance, sección 6.

## Alcance explícitamente fuera de EP-06

Clasificado como **fase posterior** en la matriz de alcance §6 (no se implementa):

- Gestión de múltiples administradores con roles diferenciados.
- Auditoría avanzada o bitácora exportable.

Fuera de alcance según la matriz §3: registrar pagos manuales, anular pagos o facturación electrónica.

No está definido en el Contexto Maestro ni en los contratos y no se implementa sin aprobación del Product Owner (ver preguntas abiertas):

- Editar los datos de un socio, suspenderlo, reactivarlo o darlo de baja.
- Buscar socios por nombre o por correo.
- Exportar listados.

## Dependencias con épicas anteriores

- **EP-02** (disponible): listado por estado, detalle y búsqueda por DNI en el servidor; pantalla de solicitudes pendientes.
- **EP-03** (disponible, con deuda): consulta de pagos en el servidor (US-025); la vista del socio queda como deuda en US-050. **US-038** es necesaria para que la vista de cobranza muestre vencidos y por vencer reales.
- **EP-05** (Sprint 4): US-052 reutiliza la resolución de socios por situación de membresía que construye US-048.

## Preguntas abiertas

1. **¿Qué incluye "gestionar socios" en el MVP?** (Product Owner). RN-ADM-01 dice "gestiona socios migrados y nuevos", pero el contrato solo define listar, ver, aprobar y rechazar. Propuesta: para el MVP, gestionar = consultar el padrón (US-051) más aprobar y rechazar (US-017). Editar datos, suspender o dar de baja requieren regla de negocio, contrato y auditoría propios; si el Product Owner los quiere en el MVP, se crea una historia nueva con su contrato antes de comprometerla.
2. **Búsqueda de socios por nombre o correo** (Product Owner y Arquitecto). No existe patrón de acceso para eso. Propuesta: en el MVP, búsqueda por DNI exacto (que ya existe) más listado por estado.
3. **¿La vista de cobranza incluye socios migrados sin activar con deuda?** (Product Owner). No tienen cuenta para pagar ni bandeja. Propuesta: no en la vista de cobranza (son `MIGRATED`); sí en el listado por estado de US-051, donde su deuda es visible en el detalle.
4. **Contrato de filtro por situación de membresía** (Arquitecto). US-052 necesita un filtro `membershipStatus` en `GET /members` (o un endpoint hermano). Debe documentarse en `docs/api/contratos-api.md` §4 antes de que US-052 entre al sprint; mientras tanto US-052 no cumple el punto 12 de la Definition of Ready. **Resuelta (2026-10-12)**: filtro adicional `membershipStatus` en `GET /members`, contratos §4 y §12, ADR-0014. US-052 está Ready.

## Historial de cambios

- 2026-10-11: Creación de la épica EP-06 y asociación de las historias US-051..US-053 (Sprint 5).
- 2026-10-12: Resuelta la pregunta abierta 4 (adenda de contrato, ADR-0014); se agrega US-081 y US-052 deja de depender de US-048.
