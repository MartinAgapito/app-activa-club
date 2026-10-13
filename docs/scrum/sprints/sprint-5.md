# Sprint 5 — Administración, dashboards y analytics

| Campo             | Valor                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Sprint            | 5                                                                                             |
| Nombre            | Administración, dashboards y analytics                                                        |
| Épica             | [EP-06](../epicas/EP-06-administracion.md) y [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Fase              | MVP                                                                                           |
| Duración sugerida | 2 semanas                                                                                     |
| Estado            | Planificado                                                                                   |

## Sprint Goal

Que **las dos portadas del producto dejen de estar "en construcción"**: el socio entra y su inicio le dice cómo está con el club, si puede reservar y qué hacer si no puede, con sus próximas reservas, sus avisos y sus últimos pagos; el administrador entra y ve de un vistazo qué requiere su atención y cómo se usan las instalaciones. Y que el administrador, por fin, pueda **consultar a cualquier socio y cualquier pago** sin salir de la plataforma.

## Alcance del sprint

Este sprint implementa lo clasificado como **MVP** en las secciones 6 (Administración) y 7 (Dashboards y analítica) de `docs/product/matriz-de-alcance.md`, sobre los contratos de `docs/api/contratos-api.md` §4, §5 y §9 y los tipos `MemberDashboard` y `AdminDashboard` de `packages/shared-types`.

Incluye **US-050**, deuda de EP-03: la pantalla de historial de pagos del socio, que US-025 especificó y nunca se construyó (el servidor sí está implementado). Entra aquí porque el inicio del socio enlaza a ella.

Cierra el MVP funcional: tras este sprint, todas las capacidades MVP de la matriz de alcance tienen historia entregada, salvo las decisiones pendientes registradas en las épicas.

**Fuera de este sprint:**

- Múltiples administradores con roles diferenciados y auditoría exportable (fase posterior, matriz §6).
- Predicciones con IA, recomendaciones y exportación de reportes (fase posterior, matriz §7).
- Editar, suspender o dar de baja socios, y buscar por nombre o correo: pendientes de definición (preguntas abiertas 1 y 2 de EP-06).
- El cobro desatendido de la renovación automática: decisión pendiente de EP-03.

## Sprint Backlog

| ID                                                                     | Título                                                                                  | Responsable        | Prioridad | Depende de             | Estimación |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | --------- | ---------------------- | ---------- |
| [US-050](../historias/US-050-ver-mi-historial-pagos.md)                | Ver mi historial de pagos en la plataforma                                              | Frontend           | Media     | US-025                 | 2          |
| [US-051](../historias/US-051-consultar-socios-admin.md)                | Consultar los socios y su situación de membresía                                        | Frontend           | Alta      | US-017                 | 3          |
| [US-052](../historias/US-052-filtrar-socios-situacion-membresia.md)    | Filtrar socios con deuda, vencidos o por vencer                                         | Backend + Frontend | Media     | US-038, US-051         | 3          |
| [US-053](../historias/US-053-consultar-pagos-socios-admin.md)          | Consultar los pagos de los socios                                                       | Frontend           | Media     | US-025                 | 3          |
| [US-054](../historias/US-054-provisionar-endpoints-dashboards.md)      | Provisionar endpoints e infraestructura de dashboards                                   | DevOps             | Crítica   | —                      | 2          |
| [US-055](../historias/US-055-resumen-personal-socio-servidor.md)       | Obtener el resumen personal del socio (servidor)                                        | Backend            | Alta      | US-038, US-041, US-054 | 5          |
| [US-056](../historias/US-056-ver-inicio-personal-socio.md)             | Ver mi inicio personal (dashboard del socio)                                            | Frontend           | Alta      | US-055                 | 5          |
| [US-057](../historias/US-057-metricas-socios-pagos-notificaciones.md)  | Calcular las métricas de socios, membresías, pagos y notificaciones (servidor)          | Backend            | Alta      | US-038, US-054         | 5          |
| [US-058](../historias/US-058-metricas-reservas-ocupacion.md)           | Calcular las métricas de reservas y ocupación (servidor)                                | Backend            | Media     | US-054                 | 5          |
| [US-059](../historias/US-059-ver-resumen-operativo-admin.md)           | Ver el resumen operativo en el inicio del administrador                                 | Frontend           | Alta      | US-057                 | 3          |
| [US-060](../historias/US-060-ver-analitica-reservas-ocupacion.md)      | Ver la analítica de reservas y ocupación                                                | Frontend           | Media     | US-058                 | 3          |
| [US-080](../historias/US-080-nombres-participantes-detalle-reserva.md) | Devolver el nombre de los socios participantes en el detalle de una reserva (servidor)  | Backend            | Media     | US-033                 | 2          |
| [US-081](../historias/US-081-nombre-socio-rango-fechas-pagos-admin.md) | Nombre del socio y rango de fechas en la consulta de pagos del administrador (servidor) | Backend + DevOps   | Media     | US-025                 | 3          |

Estimación total: **44 puntos relativos** (12 de EP-06, 28 de EP-07, 2 de EP-04 y 2 de la deuda técnica US-050). US-080 y US-081 se agregaron el 2026-10-12 con la adenda de contrato (ver abajo). Por debajo de la velocidad observada a propósito: deja margen para lo que el Sprint 4 sacrifique (US-046, US-045) y para las extensiones de contrato que este sprint necesita del Arquitecto.

**Orden de sacrificio si la velocidad no alcanza:** US-060 (vista de analítica) y US-058 (métricas de reservas y ocupación) pueden diferirse juntas sin romper el Sprint Goal del socio; luego US-052 (vista de cobranza); luego US-081 y US-080 (mejoras de presentación sobre pantallas que ya funcionan). **US-054 a US-057, US-059, US-050, US-051 y US-053 son innegociables**: son las dos portadas y las consultas básicas del administrador.

## Grafo de dependencias

```
(Sprint 4 cerrado: US-038 membresía al día, US-041 bandeja, US-048 segmentos)

US-050 (deuda EP-03)            US-051 ──► US-052 ◄── US-038
US-053 ◄── US-081 (nombre y rango de fechas)
US-074, US-077 ◄── US-080 (nombres de participantes)

US-054 ──┬──► US-055 ──► US-056
         ├──► US-057 ──► US-059
         └──► US-058 ──► US-060
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (arranque, en paralelo):** US-054 (DevOps: dos endpoints de solo lectura). En paralelo, Frontend construye las tres pantallas que **no** esperan a nadie porque el servidor ya existe: US-050 (pagos del socio), US-051 (padrón de socios) y US-053 (pagos del administrador). Backend escribe con pruebas unitarias la lógica pura de los dashboards: `daysRemaining` y alertas, armado de series por día, fórmula de ocupación. El Arquitecto documenta las extensiones de contrato que el sprint necesita (pregunta abierta 4 de EP-06 y preguntas 4 y 5 de EP-07).
- **Ola 2 (tras US-054):** US-055 (resumen del socio) y US-057 (métricas de socios, pagos y notificaciones) en paralelo.
- **Ola 3:** US-056 (inicio del socio) sobre US-055; US-059 (inicio del administrador) sobre US-057; US-058 (métricas de reservas y ocupación); US-052 (vista de cobranza) con el contrato ya extendido.
- **Ola 4:** US-060 (analítica) sobre US-058.
- **Ola 5 (verificación extremo a extremo):** en `dev`, socio al día → inicio con "Nueva reserva" habilitada, próximas reservas y avisos; socio con deuda → alerta, acceso a pagar y "Nueva reserva" deshabilitada, y el servidor rechaza la reserva igual; administrador → cifras del inicio coinciden con las pantallas de socios, solicitudes, reservas pendientes y pagos; analítica coherente con las reservas de prueba.

## Capacidad de trabajo paralelo

- Tres de las once historias (US-050, US-051, US-053) son solo de frontend sobre endpoints ya desplegados y probados: pueden terminarse en la Ola 1.
- La separación entre servidor y pantalla en cada dashboard (US-055/US-056, US-057/US-059, US-058/US-060) repite el patrón de los sprints anteriores.
- US-057 y US-058 escriben campos distintos del mismo endpoint; conviene acordar al inicio la estructura del handler para que no choquen.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- El inicio del socio muestra todo lo que pide el Contexto Maestro, y `canReserve` coincide siempre con el resultado de `POST /reservations`.
- El dashboard administrativo muestra las ocho métricas de RN-ANL-01..08 y cada cifra coincide con su pantalla de detalle.
- El administrador consulta el padrón completo, encuentra un socio por DNI, ve su situación y sus pagos, y lista a los socios con deuda, vencidos o por vencer.
- Ninguna consulta nueva usa un `Scan` completo de la tabla.
- Los casos DA-01..DA-09, AD-01..AD-03 y la parte de dashboard de P-10 de la matriz de trazabilidad quedan cubiertos.
- No se introdujo alcance fuera del MVP de las secciones 6 y 7 de la matriz de alcance.

## Ceremonias

- **Planning:** selección de US-050..US-060, confirmación del Sprint Goal y resolución de las preguntas abiertas que afectan criterios: período de las métricas y fórmula de ocupación (EP-07, 1 y 2), alcance de "gestionar socios" (EP-06, 1) y extensiones de contrato (EP-06, 4; EP-07, 4 y 5).
- **Daily:** foco en que las cifras de los dashboards coincidan con las pantallas de detalle; es el defecto más probable y el más visible.
- **Review:** recorrido completo del MVP en `dev`, del registro al dashboard, como ensayo de la demostración final.
- **Retrospective:** cierre del MVP funcional: revisión de deudas abiertas (renovación automática desatendida, verificación extremo a extremo pendiente, decisiones de producto sin resolver) antes de planificar la estabilización.

## Adenda de contrato (2026-10-12)

La pregunta abierta 4 de EP-06 y las preguntas 1, 2 y 5 de EP-07 (en lo que toca a reservas y ocupación) quedan resueltas en `docs/api/contratos-api.md` §12 y [ADR-0014](../../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md). US-052 y US-058 pasan a **Ready**. La interfaz ya construida destapó además dos límites que se cubren con historias nuevas de backend: US-080 (nombre de los socios participantes en el detalle de reserva) y US-081 (nombre del socio y rango de fechas en los pagos del administrador). Todos los cambios son aditivos, sin índices ni rutas nuevas; solo US-081 toca Terraform (un permiso IAM). Los ajustes de pantalla para mostrar los nombres (US-053, US-074, US-077) son tareas de frontend pequeñas que el Product Owner debe priorizar.

## Notas para DevOps (US-054)

- Solo dos Lambdas nuevas y ambas de solo lectura: no deben recibir ningún permiso de escritura.
- `GET /dashboard/admin` consulta GSI2 y GSI3 sobre los diez recursos; dimensionar el tiempo máximo de ejecución y documentarlo en el PR.
- La Lambda de `GET /dashboard/admin` necesita además `GetItem` y `Query` sobre la **tabla base** (catálogo por `resourceId` y bloqueos de mantenimiento, patrón #30), no solo sobre los índices (contratos §12.2).
- Redespliegue del stage y verificación de CORS tras agregar las rutas, como en cada sprint.

## Riesgos del sprint

- **`canReserve` del inicio distinto de la regla real de reserva**. Impacto muy alto: el inicio deja reservar y el servidor rechaza, o al revés, en plena demo. Mitigación: criterio 3 de US-055 (misma función, no una copia) y prueba cruzada contra `POST /reservations`.
- **Cifras del dashboard que no coinciden con las pantallas de detalle**. Impacto alto: pérdida de confianza en la analítica. Mitigación: criterio 6 de US-057; pruebas con datos preparados.
- **Extensiones de contrato que llegan tarde** (filtro por situación de membresía, horario de reservas, códigos de alerta). Impacto medio: US-052 y parte de US-058 bloqueadas. Mitigación: el Arquitecto las documenta en la Ola 1; ambas historias están en el orden de sacrificio.
- **Métricas calculadas con lecturas costosas**. Impacto medio: latencia y costo. Mitigación: criterio de "sin `Scan`" en cada historia; volumen mock pequeño.
- **Gráficos casi vacíos con datos mock**. Impacto medio en la demostración. Mitigación: pregunta abierta 7 de EP-07 (juego de datos de prueba en `dev`).
- **Zona horaria en `daysRemaining` y en series por día**. Impacto medio. Mitigación: utilidad de fechas de Lima ya existente; pruebas de borde de medianoche.

## Historial de cambios

- 2026-10-11: Creación del Sprint 5 con las historias de EP-06 (US-051..US-053), EP-07 (US-054..US-060) y la deuda técnica US-050 de EP-03.
- 2026-10-12: US-054 con infraestructura desplegada, pendiente lógica: `GET /dashboard/member` y `GET /dashboard/admin` en 501 hasta US-055, US-057 y US-058 (Ola 1). Desbloquea US-055, US-057 y US-058.
- 2026-10-12: Adenda de contrato del Arquitecto (contratos §12, ADR-0014): US-052 y US-058 pasan a Ready; se agregan US-080 (2 puntos) y US-081 (3 puntos); US-052 deja de depender de US-048.
- 2026-10-12: US-058 implementada, pendiente verificación en `dev`: reservas y ocupación de `GET /dashboard/admin` (función sin handler en `apps/api/src/dashboard/`); el handler compartido `handlers/dashboard/admin.ts` espera componerse con US-057.
- 2026-10-12: US-055 implementada: `GET /dashboard/member` con `canReserve` de la misma función que la reserva, alertas `RENEWAL_DUE`/`MEMBERSHIP_EXPIRED`/`PAYMENT_DEBT` y solo lecturas. Pendiente verificación en `dev`.
- 2026-10-12: US-057 implementada (Backend): `GET /dashboard/admin` entrega socios, membresías, pendientes, pagos y notificaciones con `Query` `Select: COUNT` sobre GSI2; el handler deja un punto de extensión para US-058.
- 2026-10-12: US-059 implementada (Frontend): el inicio del administrador consume `GET /dashboard/admin` con el hook compartido `useAdminDashboard` (clave `['dashboard','admin']`, reutilizable por US-060); pendientes exactos, socios por estado, por vencer, pagos y notificaciones del mes con su período en hora de Lima.
