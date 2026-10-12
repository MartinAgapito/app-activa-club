# EP-07 — Dashboards y analytics

| Campo            | Valor               |
| ---------------- | ------------------- |
| ID               | EP-07               |
| Tipo             | Épica               |
| Fase             | MVP                 |
| Estado           | Planificada         |
| Dependencias     | EP-03, EP-04, EP-05 |
| Sprint principal | Sprint 5            |

## Descripción

Entregar las dos portadas del producto: el **inicio personal del socio**, que reúne su situación de membresía, si puede reservar y por qué no, sus próximas reservas, sus avisos y sus últimos pagos; y el **dashboard del administrador**, con las ocho métricas del MVP (RN-ANL-01..08), separado en un resumen operativo con accesos a lo que requiere acción y una vista de analítica de reservas y ocupación.

La épica se construye sobre los contratos de [`docs/api/contratos-api.md`](../../api/contratos-api.md) §9 (`GET /dashboard/member`, `GET /dashboard/admin`), los tipos `MemberDashboard` y `AdminDashboard` ya versionados en `packages/shared-types/src/dashboard.ts`, los patrones de acceso de GSI1, GSI2 y GSI3 que el [modelo de datos](../../data/modelo-dynamodb.md) §4 reservó para el dashboard y la analítica, y las pantallas placeholder `/socio` (`MemberDashboardPage`), `/admin` (`AdminDashboardPage`) y `/admin/analytics` (`AnalyticsPage`). Ninguno de los dos endpoints existe todavía en Terraform ni en `apps/api`.

## Valor de negocio

Las dos pantallas que más se ven del producto dicen hoy "en construcción". El inicio del socio es lo primero que encuentra cada vez que entra y el lugar donde la plataforma le explica, en lenguaje claro, por qué no puede reservar y cómo resolverlo. El dashboard del administrador es la evidencia, ante la directiva del club, de que la digitalización produce información que el sistema on-premise nunca dio: cuántos socios están al día, qué se usa, cuándo y cuánto.

Es también la épica que cierra el caso DA-01 y el P-10 en su parte de dashboard, pendientes desde EP-03 y EP-04.

## Objetivos de la épica

- Infraestructura de los dos endpoints de dashboards provisionada en Terraform, con permisos de solo lectura (US-054).
- **Resumen personal del socio** en una sola consulta, con un `canReserve` que coincide siempre con la regla de reserva (US-055), y su **pantalla de inicio** (US-056).
- **Métricas administrativas** de socios, membresías, reservas pendientes, pagos y notificaciones (US-057) y de reservas y ocupación (US-058), sin `Scan` de tabla.
- **Inicio del administrador** con indicadores accionables (US-059) y **vista de analítica** de reservas y ocupación (US-060).

## Historias asociadas

| ID                                                                    | Título                                                                         | Responsable | Depende de             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- | ---------------------- |
| [US-054](../historias/US-054-provisionar-endpoints-dashboards.md)     | Provisionar endpoints e infraestructura de dashboards                          | DevOps      | —                      |
| [US-055](../historias/US-055-resumen-personal-socio-servidor.md)      | Obtener el resumen personal del socio (servidor)                               | Backend     | US-038, US-041, US-054 |
| [US-056](../historias/US-056-ver-inicio-personal-socio.md)            | Ver mi inicio personal (dashboard del socio)                                   | Frontend    | US-055                 |
| [US-057](../historias/US-057-metricas-socios-pagos-notificaciones.md) | Calcular las métricas de socios, membresías, pagos y notificaciones (servidor) | Backend     | US-038, US-054         |
| [US-058](../historias/US-058-metricas-reservas-ocupacion.md)          | Calcular las métricas de reservas y ocupación (servidor)                       | Backend     | US-054                 |
| [US-059](../historias/US-059-ver-resumen-operativo-admin.md)          | Ver el resumen operativo en el inicio del administrador                        | Frontend    | US-057                 |
| [US-060](../historias/US-060-ver-analitica-reservas-ocupacion.md)     | Ver la analítica de reservas y ocupación                                       | Frontend    | US-058                 |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- El inicio del socio muestra bienvenida, estado de membresía, tipo y vencimiento, días restantes, acciones de pagar/renovar y nueva reserva, alertas cuando no puede reservar, próximas reservas, accesos a las seis instalaciones, avisos recientes y un resumen de pagos (Contexto Maestro, "Dashboard del socio").
- `canReserve` coincide siempre con el resultado de `POST /reservations` para el mismo socio: no hay socio que el inicio deje reservar y el servidor rechace, ni al revés (RN-PAG-06, RN-RES-12).
- El dashboard administrativo cubre las ocho métricas de RN-ANL-01..08 y cada cifra coincide con la pantalla de detalle correspondiente (socios, solicitudes, reservas pendientes, pagos, historial de avisos).
- Ninguna métrica ni resumen se calcula con un `Scan` completo de la tabla, y ninguna respuesta incluye datos personales de terceros.
- Todas las fechas, días y horarios se calculan en `America/Lima`.
- Los casos DA-01..DA-09 y la parte de dashboard de P-10 de la matriz de trazabilidad quedan cubiertos.
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance, sección 7.

## Alcance explícitamente fuera de EP-07

Clasificado como **fase posterior** en la matriz de alcance §7 (no se implementa):

- Predicciones o analítica avanzada con IA.
- Recomendaciones personalizadas.
- Exportación de reportes (PDF o Excel).

No está en el contrato ni en el Contexto Maestro y no se implementa sin aprobación del Product Owner:

- Elegir o comparar períodos desde la pantalla de analítica.
- Montos recaudados o indicadores financieros más allá de pagos exitosos y fallidos.
- Noticias o banners del club distintos de los avisos publicados por el administrador.

## Dependencias con épicas anteriores

- **EP-03** (disponible, con deuda): pagos y estado de membresía. **US-038 es bloqueante**: sin el recálculo diario, `daysRemaining`, las alertas de renovación, `canReserve` para membresías vencidas y `membershipsExpiringSoon` salen falsos. El historial de pagos del socio (US-050) habilita el resumen de pagos del inicio.
- **EP-04** (implementada, verificación extremo a extremo pendiente): reservas por socio (GSI1) y por recurso y fecha (GSI3), estados y mantenimientos; regla de elegibilidad para reservar.
- **EP-05** (Sprint 4): bandeja del socio (US-041) para los avisos recientes; historial de avisos enviados (US-049) para la métrica de notificaciones.
- **EP-06** (Sprint 5, en paralelo): las pantallas de destino de los accesos directos del inicio del administrador (US-051, US-052, US-053). Si alguna no está lista, el acceso se omite; no bloquea.

## Relación con EP-08 (experiencia de usuario e interfaz)

[EP-08](./EP-08-experiencia-usuario-interfaz.md) (propuesta, Sprint 4B) entrega antes de este sprint un inicio útil del socio (US-070) y del administrador (US-071) con endpoints ya existentes, construidos como bloques independientes, y los componentes de tabla, pestañas, panel lateral, ventana y avisos efímeros. Si EP-08 se aprueba, **US-056 y US-059 no rehacen esas páginas**: reemplazan la fuente de datos de los bloques existentes por `GET /dashboard/member` y `GET /dashboard/admin` y agregan los bloques que faltan (avisos recientes, resumen de pagos, métricas). US-060 usa los componentes de EP-08. Si EP-08 no se aprueba, estas historias se ejecutan tal como están escritas.

## Preguntas abiertas

1. **Período de las métricas del administrador** (Product Owner). El contrato de `GET /dashboard/admin` no recibe parámetros. Propuesta: pagos y notificaciones del mes calendario en curso; reservas y ocupación de los últimos 30 días hasta hoy; socios, vencimientos y pendientes como foto del momento. La pantalla siempre indica el período.
2. **Fórmula de ocupación** (Product Owner). Propuesta: horas reservadas por reservas activas sobre horas operativas del recurso en el período según su horario vigente, excluyendo las horas bloqueadas por mantenimiento.
3. **Resumen de pagos en el inicio del socio** (Arquitecto). El contrato de `GET /dashboard/member` no lo incluye. Propuesta: el frontend lo obtiene de `GET /payments?limit=3`, que ya existe, sin cambiar el contrato.
4. **Códigos de las alertas del socio** (Arquitecto). El contrato muestra `RENEWAL_DUE` como ejemplo. Propuesta: `RENEWAL_DUE` (por vencer), `MEMBERSHIP_EXPIRED` (vencida) y `PAYMENT_DEBT` (deuda pendiente), documentados en el contrato §9.
5. **"Reservas por día y horario"** (Arquitecto). RN-ANL-04 pide día **y horario**, pero el contrato solo trae `reservationsByDay`. Propuesta: agregar un campo con la cantidad de reservas por hora de inicio (06:00 a 21:00) del mismo período. Sin esa extensión, US-058 no está lista en ese punto.
6. **Qué cuenta como "notificación enviada"** (Product Owner). Depende de la pregunta abierta 13 de EP-05. Propuesta: contar los registros `Notification` del período, publicados y automáticos, y mostrar el desglose si el contrato lo permite.
7. **Datos para la demostración** (Product Owner y QA). Con el padrón mock y pocas reservas, los gráficos pueden verse casi vacíos. Propuesta: un juego de reservas y pagos de prueba en `dev` preparado por QA para la demo, nunca en `prd`.

## Historial de cambios

- 2026-10-11: Creación de la épica EP-07 y asociación de las historias US-054..US-060 (Sprint 5).
- 2026-10-11: Se agrega la sección "Relación con EP-08": si se aprueba EP-08, US-056 y US-059 enriquecen los inicios de US-070 y US-071 en lugar de construirlos desde cero. No cambia ningún criterio de EP-07.
