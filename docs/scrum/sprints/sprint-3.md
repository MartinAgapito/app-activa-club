# Sprint 3 — Reservas de instalaciones

| Campo             | Valor                                              |
| ----------------- | -------------------------------------------------- |
| Sprint            | 3                                                  |
| Nombre            | Reservas de instalaciones                          |
| Épica             | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Fase              | MVP                                                |
| Duración sugerida | 2 semanas                                          |
| Estado            | Planificado                                        |

## Sprint Goal

Que un socio **activo y al día** pueda finalmente usar el club: elegir una instalación, ver qué franjas están libres, reservar con otros socios e invitados externos, y cancelar hasta 24 horas antes; que las parrillas y el salón social pasen por la aprobación de un administrador; y que **todas las reglas de reserva se cumplan en el servidor y bajo concurrencia** —cruces, aforo, horario, superposición de participantes, tope mensual de invitados, mantenimiento y bloqueo por deuda—, cerrando de paso los casos que quedaron pendientes de los Sprints 1 y 2 (A-11, A-15 y P-10).

## Alcance del sprint

Este sprint implementa exclusivamente lo clasificado como **MVP** en la sección 4 (Reservas) de `docs/product/matriz-de-alcance.md`, sobre los contratos ya definidos en `docs/api/contratos-api.md` §6 y §7 y el modelo de datos ya decidido en `docs/data/modelo-dynamodb.md` §3.7–3.11. **No se define ningún contrato nuevo ni ninguna entidad nueva.**

**Fuera de este sprint:**

- Lista de espera, check-in por QR y reservas recurrentes (fase posterior, matriz §4).
- Cobro por reserva de invitados externos (fuera de alcance, matriz §4).
- El **módulo de notificaciones** (`RESERVATION_CONFIRMED`, `RESERVATION_CANCELLED`, `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_MAINTENANCE`, recordatorio de reserva): EP-05. Aquí solo se deja el rastro previsto por el contrato; el caso R-21 se cierra allí.
- El **dashboard del socio** (`GET /dashboard/member`, con `canReserve` y próximas reservas) y las **métricas de reservas y ocupación** del dashboard administrativo: EP-07. El caso DA-01 se cierra allí.
- La decisión sobre la simulación del cargo real de Culqi, que sigue su curso por separado en EP-03 y no bloquea este sprint.

## Sprint Backlog

| ID                                                                        | Título                                                       | Responsable        | Prioridad | Depende de             | Estimación |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ | --------- | ---------------------- | ---------- |
| [US-027](../historias/US-027-provisionar-endpoints-reservas.md)           | Provisionar endpoints e infraestructura de reservas          | DevOps             | Crítica   | —                      | 5          |
| [US-028](../historias/US-028-catalogo-recursos-club.md)                   | Consultar el catálogo de instalaciones del club              | Backend + DevOps   | Crítica   | US-027                 | 3          |
| [US-029](../historias/US-029-disponibilidad-recurso-por-dia.md)           | Consultar la disponibilidad de una instalación por día       | Backend + Frontend | Alta      | US-028                 | 5          |
| [US-030](../historias/US-030-crear-reserva-confirmacion-automatica.md)    | Reservar una instalación con validación completa en servidor | Backend            | Crítica   | US-028                 | 8          |
| [US-031](../historias/US-031-participantes-socios-invitados.md)           | Agregar otros socios e invitados externos a una reserva      | Backend            | Alta      | US-030                 | 5          |
| [US-032](../historias/US-032-reservar-instalacion-desde-plataforma.md)    | Reservar una instalación desde la plataforma                 | Frontend           | Crítica   | US-029, US-030, US-031 | 5          |
| [US-033](../historias/US-033-consultar-cancelar-mis-reservas.md)          | Consultar y cancelar mis reservas                            | Backend + Frontend | Alta      | US-030                 | 5          |
| [US-034](../historias/US-034-aprobacion-rechazo-reservas-admin.md)        | Aprobar o rechazar reservas de parrillas y salón social      | Backend + Frontend | Alta      | US-030                 | 5          |
| [US-035](../historias/US-035-bloqueo-recursos-mantenimiento.md)           | Bloquear temporalmente un recurso por mantenimiento          | Backend + Frontend | Media     | US-028, US-029         | 3          |
| [US-036](../historias/US-036-gestion-recursos-consulta-reservas-admin.md) | Gestionar recursos y consultar todas las reservas como admin | Backend + Frontend | Media     | US-028, US-030         | 5          |

Estimación total: **49 puntos relativos** (Sprint 1 cerró con 45; Sprint 2 con 42).

Es el sprint más cargado del MVP porque EP-04 concentra once endpoints y doce reglas de negocio simultáneas. La estimación es alta a propósito y se compensa con dos factores reales: no hay ninguna integración externa nueva (lo caro del Sprint 2 fue Culqi) y los módulos de Terraform, el middleware de roles, la auditoría y la paginación ya están maduros desde los sprints anteriores.

**Orden de sacrificio si la velocidad no alcanza:** US-036 y luego US-035 (ambas de prioridad Media) son las candidatas a diferirse a un sprint siguiente sin romper el Sprint Goal, porque son capacidades administrativas y no bloquean el recorrido del socio. **US-027 a US-034 son innegociables**: sin ellas no existe la reserva.

## Grafo de dependencias

```
(Sprint 2 cerrado: socios ACTIVE al día, membershipStatus y outstandingBalance confiables)
   └──► US-027 ──► US-028 ──┬──► US-029 ──┐
                            │             ├──► US-032
                            ├──► US-030 ──┤
                            │      │      └──► US-031 ──┘
                            │      ├──► US-033
                            │      ├──► US-034
                            │      └──► US-036
                            └──► US-035
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (arranque, en paralelo):** US-027 (DevOps: once endpoints, autorización por rol, permisos sobre GSI3). En paralelo, Backend implementa con pruebas unitarias el dominio puro que no depende del despliegue (generación de franjas horarias en `America/Lima`, cálculo de solapamientos, resolución de `endsAt` por `blockMinutes`, regla de las 24 horas, mes calendario del invitado), y Frontend construye el catálogo y el selector de franjas contra el contrato con datos simulados.
- **Ola 2 (tras US-027):** US-028 (catálogo cargado y consultable) — es el dato maestro del que dependen todas las demás historias, así que se cierra primero y rápido.
- **Ola 3:** US-029 (disponibilidad) y US-030 (creación de reserva con validaciones base) en paralelo: comparten el mismo cálculo de solapamiento, que conviene extraer una sola vez y reutilizar.
- **Ola 4:** US-031 (participantes e invitados) sobre la creación ya funcionando, y en paralelo US-033 (mis reservas y cancelación) y US-034 (aprobación administrativa), que solo dependen de que exista la entidad `Reservation`.
- **Ola 5:** US-032 (flujo de reserva real en la interfaz) integrando disponibilidad, participantes y errores del contrato; en paralelo US-035 (mantenimiento) y US-036 (gestión de recursos y consola administrativa).
- **Ola 6 (verificación extremo a extremo):** demo del recorrido completo en `dev`: socio activo reserva una cancha → aparece en sus reservas → la cancela → la franja vuelve a estar libre; socio solicita una parrilla → el administrador la aprueba; socio con deuda intenta reservar → bloqueado con acceso al pago; administrador bloquea un recurso → la franja desaparece de la disponibilidad. Más las pruebas de concurrencia (misma franja, mismo invitado).

## Capacidad de trabajo paralelo

- Los contratos `docs/api/contratos-api.md` §6 y §7 existen desde el Sprint 0 y los tipos y esquemas ya están versionados en `packages/shared-types/src/reservation.ts` y `packages/validation/src/reservation.ts`: Frontend y Backend pueden desarrollar en paralelo desde el día 1 sin esperar al otro.
- La separación de US-030 (reglas base de la reserva) y US-031 (participantes) es deliberada: son la parte más densa del sprint y juntas serían una historia imposible de cerrar; separadas, ambas caben y se pueden probar de forma independiente.
- La separación de US-030/US-031 (servidor) y US-032 (experiencia) permite que el núcleo de reglas y el flujo de pantalla avancen a la vez, igual que se hizo con US-021/US-022 en el Sprint 2.
- US-033, US-034, US-035 y US-036 no dependen entre sí: pueden repartirse entre personas distintas en la misma ola.
- El cálculo de solapamiento de intervalos y la conversión de horarios a `America/Lima` son lógica pura: se pueden escribir y probar en la Ola 1, antes de que exista cualquier endpoint desplegado.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- Un socio `ACTIVE` sin deuda puede completar el recorrido entero en `dev`: elegir instalación → ver franjas libres → agregar participantes → reservar → ver la reserva → cancelarla → la franja vuelve a estar disponible.
- Una reserva de parrilla o salón social queda `PENDING_APPROVAL` y un administrador la aprueba o la rechaza con motivo, con auditoría en ambos casos.
- Un socio con deuda o membresía vencida **no** puede reservar y recibe `MEMBER_HAS_DEBT`; un socio que no está `ACTIVE` recibe `MEMBERSHIP_REQUIRED`. Cierra P-10 (§3), A-11 y A-15 (§2) de la matriz de trazabilidad.
- Ninguna regla de reserva puede saltarse llamando directamente a la API sin pasar por la interfaz.
- Dos peticiones concurrentes por la misma franja terminan con una sola reserva; dos reservas concurrentes con el mismo invitado en su segunda visita del mes terminan con una sola aceptada.
- El administrador puede bloquear un recurso por mantenimiento, liberarlo y editar aforo y horario, y los cambios se reflejan en la disponibilidad.
- Un socio no ve ni opera reservas de otro socio.
- Los casos R-01..R-20 y R-22..R-29 de `docs/testing/matriz-trazabilidad.md` §4 quedan cubiertos; R-21 (notificación de mantenimiento) queda para EP-05, documentado como tal.
- No se introdujo alcance fuera del MVP de la sección 4 de la matriz de alcance.

## Ceremonias

- **Planning:** selección de US-027..US-036, confirmación del Sprint Goal y **resolución de las tres decisiones funcionales pendientes** de EP-04 (identificación del socio participante, mecanismo de carga del catálogo, efecto del mantenimiento sobre reservas existentes).
- **Daily:** foco en desbloquear la cadena US-027 → US-028 → US-030 y en el estado de las pruebas de concurrencia, que suelen aparecer tarde y son las que más riesgo esconden.
- **Review:** demostración extremo a extremo en `dev` del recorrido del socio y del administrador, incluidos los casos de rechazo (cruce, aforo, invitado sin cupo, deuda, mantenimiento).
- **Retrospective:** revisión del tamaño del sprint (49 puntos frente a 42–45 de velocidad observada) y ajustes antes de EP-05, que ya tiene deuda acumulada: siete eventos de notificación pendientes de los Sprints 1, 2 y 3.

## Decisiones funcionales pendientes (resolver en Planning)

1. **Identificación del socio participante (bloquea parte de US-031).** El contrato exige `memberId` para un participante de tipo `MEMBER`, pero ningún endpoint del rol `member` permite obtenerlo (`GET /members` es solo de `admin`). Propuesta del Product Analyst: resolver por **DNI** reutilizando el ítem de unicidad `UNIQ#DNI#` ya existente y devolver solo el dato mínimo de confirmación (nombre y `memberId`). Requiere decisión del Arquitecto y registro en `docs/api/contratos-api.md` antes de implementar; sin ella, la parte de socios participantes de US-031 no cumple la Definition of Ready (la de invitados externos sí).
2. **Mecanismo de carga inicial del catálogo de recursos (afecta US-028).** No existe endpoint de creación de recursos ni la migración los crea. Hay que decidir el mecanismo versionado y repetible. Lo que el negocio exige es que el catálogo exista, sea idempotente y no se pierda al redesplegar.
3. **Efecto del mantenimiento sobre reservas existentes (afecta US-035).** Propuesta del Product Analyst: el bloqueo **no cancela** automáticamente las reservas ya creadas en esa franja; impide reservas nuevas e informa al administrador cuántas quedan afectadas para que decida. Cualquier decisión distinta debe registrarse antes de implementar.

## Aclaraciones de reglas incorporadas en este sprint

Estas no amplían el alcance: precisan reglas ya acordadas cuya interpretación estaba abierta y que, sin definirse, se resolverían improvisando durante la implementación.

- Una reserva `PENDING_APPROVAL` **ocupa la franja** desde su creación (US-029, US-030). Si no la ocupara, dos solicitudes de la misma parrilla y horario podrían aprobarse ambas, violando RN-RES-07.
- Se consideran **activas**, a efectos de cruces y disponibilidad, las reservas `CONFIRMED`, `PENDING_APPROVAL` y `APPROVED`; las `CANCELLED` y `REJECTED` no bloquean.
- El **rechazo administrativo** devuelve el cupo mensual de los invitados externos, igual que la cancelación (US-034): un invitado no debe perder una de sus dos visitas por una reserva que el club nunca aprobó. Nuevo caso R-29 en la matriz de trazabilidad.
- El borde de las **24 horas** se define como permitido cuando faltan 24 horas o más (US-033), y debe tener prueba de borde explícita.
- La restricción de RN-RES-12 (activo y sin deuda) aplica al **titular**, que es el responsable según RN-RES-06, no a los socios participantes (US-031). Extenderla a los participantes sería un cambio de regla que requiere aprobación del product owner.

## Notas para DevOps (US-027)

- **Permisos sobre GSI3**: es el primer sprint que consulta el tercer índice. Verificar que el ARN de índices usado en `environments/dev` cubre GSI3 y no solo los que usaban EP-02 y EP-03; de lo contrario las Lambdas de disponibilidad y de creación de reserva fallarán con `AccessDenied` en tiempo de ejecución, no en el `plan`.
- **`TransactWriteItems`**: la creación de reserva escribe cabecera, participantes y contadores de invitado de forma atómica. Confirmar el permiso y recordar que DynamoDB exige la acción concreta para **cada** operación dentro de la transacción (ya pasó en US-016 y en el flujo de activación).
- **Rutas anidadas**: `DELETE /resources/{resourceId}/maintenance/{blockId}` es la primera ruta con dos parámetros de ruta. Verificar que `modules/endpoint` la soporta antes de la Ola 2.
- **Redespliegue del stage y CORS**: se agregan once rutas de una vez. Verificarlo explícitamente antes de integrar el frontend; ya rompió la integración en los Sprints 1 y 2.
- **Sin secretos nuevos**: EP-04 no integra proveedores externos, así que no debería requerir cambios en `bootstrap`. Si aun así hiciera falta un permiso nuevo del rol de CI, aplicarlo con credenciales elevadas **antes** de mergear el PR.

## Riesgos del sprint

| Riesgo                                                                                              | Impacto                                                                                  | Mitigación                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint sobredimensionado (49 puntos frente a una velocidad observada de 42–45)                      | Alto: historias a medias al cierre                                                       | Orden de sacrificio explícito (US-036, luego US-035); revisión de avance a mitad de sprint; US-027 a US-034 innegociables                                     |
| Doble reserva de la misma franja por concurrencia                                                   | Muy alto: dos socios en la misma cancha, error visible e indefendible en la demo         | Escritura condicional/transaccional obligatoria en US-030; prueba de concurrencia explícita en la Ola 6, no al final                                          |
| Contador mensual de invitado que supera 2 por reintentos o concurrencia                             | Alto: la regla de negocio deja de valer                                                  | Incremento atómico con condición `visitCount < 2` (modelo §3.10); prueba de concurrencia con el mismo invitado                                                |
| Retraso de US-027 (once endpoints + permisos sobre GSI3)                                            | Alto: bloquea todo el sprint                                                             | Priorizar en Ola 1; permitir dividir el despliegue en dos PR; avanzar el dominio puro con pruebas unitarias sin depender del despliegue                       |
| Errores de zona horaria (`America/Lima` vs. UTC) en franjas, corte de 24 h y mes del invitado       | Alto: reservas fuera de horario, cancelaciones mal permitidas o denegadas                | Regla ya fijada en el modelo de datos §2; concentrar la conversión en una utilidad única probada en la Ola 1; pruebas de borde (06:00, cierre, cambio de mes) |
| Decisión pendiente sobre cómo identificar al socio participante                                     | Medio-Alto: US-031 queda a medias o se implementa una solución que luego hay que rehacer | Resolver en Planning con el Arquitecto; la parte de invitados externos puede avanzar mientras tanto                                                           |
| Catálogo de recursos ausente o inconsistente entre ambientes                                        | Medio-Alto: nada se puede probar en `dev`                                                | US-028 en la Ola 2, con carga idempotente y documentada como paso del despliegue de un ambiente                                                               |
| Doble mecanismo de mantenimiento (`resourceStatus=MAINTENANCE` vs. `MaintenanceBlock`) mal aplicado | Medio: recurso bloqueado sin que nadie entienda por qué                                  | Semántica definida en US-035 y US-036 (indefinido vs. ventana acotada); la interfaz debe indicar cuál está aplicando                                          |
| Reglas críticas validadas solo en el frontend                                                       | Alto: se pueden saltar llamando a la API                                                 | Criterio explícito en US-030, US-031 y US-032; pruebas de integración de API que llaman al endpoint sin pasar por la interfaz                                 |
| Fuga de datos personales de terceros al mostrar participantes                                       | Medio: privacidad de socios ajenos                                                       | Criterio 13 de US-031: solo nombre y apellido de los participantes, nunca correo, teléfono, DNI completo ni estado de membresía                               |
| Regresión de la capa de transporte al agregar once rutas (CORS / stage)                             | Medio: integración rota como en los Sprints 1 y 2                                        | Verificación explícita de CORS y redespliegue del stage en la Ola 2, antes de integrar el frontend                                                            |
| Deuda acumulada de notificaciones (siete eventos de reserva pendientes)                             | Medio: EP-05 crece sprint a sprint                                                       | Dejar el rastro de evento previsto por el contrato en cada acción; listar los eventos pendientes en la Retrospective para dimensionar EP-05                   |
| Costos fuera de Free Tier al agregar once Lambdas y sus alarmas                                     | Bajo: presupuesto                                                                        | Dimensionar mínimo, sin recursos siempre encendidos; revisar en el plan de Terraform                                                                          |

## Historial de cambios

- 2026-08-09: Creación del Sprint 3 con las 10 historias de EP-04 (US-027..US-036).
