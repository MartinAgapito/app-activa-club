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

Este sprint implementa exclusivamente lo clasificado como **MVP** en la sección 4 (Reservas) de `docs/product/matriz-de-alcance.md`, sobre los contratos definidos en `docs/api/contratos-api.md` §6 y §7 y el modelo de datos de `docs/data/modelo-dynamodb.md` §3.7–3.11.

Al cerrar las decisiones funcionales pendientes se agregaron, sin ampliar el alcance funcional, **dos endpoints de lectura** (`GET /members/lookup?dni=`, `GET /guests/lookup?dni=`) y **una entidad** (`GuestProfile`, modelo §3.15): sin ellos RN-RES-03/04 no era implementable desde la interfaz. Ver "Decisiones funcionales resueltas" más abajo.

**Fuera de este sprint:**

- Lista de espera, check-in por QR y reservas recurrentes (fase posterior, matriz §4).
- Cobro por reserva de invitados externos (fuera de alcance, matriz §4).
- El **módulo de notificaciones** (`RESERVATION_CONFIRMED`, `RESERVATION_CANCELLED`, `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_MAINTENANCE`, recordatorio de reserva): EP-05. Aquí solo se deja el rastro previsto por el contrato; el caso R-21 se cierra allí.
- El **dashboard del socio** (`GET /dashboard/member`, con `canReserve` y próximas reservas) y las **métricas de reservas y ocupación** del dashboard administrativo: EP-07. El caso DA-01 se cierra allí.
- Cualquier cambio funcional del módulo de pagos más allá del cambio de proveedor: US-037 migra la pasarela sin tocar reglas, contratos ni alcance de EP-03.

## Sprint Backlog

| ID                                                                        | Título                                                       | Responsable                 | Prioridad | Depende de             | Estimación |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- | --------- | ---------------------- | ---------- |
| [US-027](../historias/US-027-provisionar-endpoints-reservas.md)           | Provisionar endpoints e infraestructura de reservas          | DevOps                      | Crítica   | —                      | 5          |
| [US-028](../historias/US-028-catalogo-recursos-club.md)                   | Consultar el catálogo de instalaciones del club              | Backend + DevOps            | Crítica   | US-027                 | 3          |
| [US-029](../historias/US-029-disponibilidad-recurso-por-dia.md)           | Consultar la disponibilidad de una instalación por día       | Backend + Frontend          | Alta      | US-028                 | 5          |
| [US-030](../historias/US-030-crear-reserva-confirmacion-automatica.md)    | Reservar una instalación con validación completa en servidor | Backend                     | Crítica   | US-028                 | 8          |
| [US-031](../historias/US-031-participantes-socios-invitados.md)           | Agregar otros socios e invitados externos a una reserva      | Backend                     | Alta      | US-030                 | 5          |
| [US-032](../historias/US-032-reservar-instalacion-desde-plataforma.md)    | Reservar una instalación desde la plataforma                 | Frontend                    | Crítica   | US-029, US-030, US-031 | 5          |
| [US-033](../historias/US-033-consultar-cancelar-mis-reservas.md)          | Consultar y cancelar mis reservas                            | Backend + Frontend          | Alta      | US-030                 | 5          |
| [US-034](../historias/US-034-aprobacion-rechazo-reservas-admin.md)        | Aprobar o rechazar reservas de parrillas y salón social      | Backend + Frontend          | Alta      | US-030                 | 5          |
| [US-035](../historias/US-035-bloqueo-recursos-mantenimiento.md)           | Bloquear temporalmente un recurso por mantenimiento          | Backend + Frontend          | Media     | US-028, US-029         | 3          |
| [US-036](../historias/US-036-gestion-recursos-consulta-reservas-admin.md) | Gestionar recursos y consultar todas las reservas como admin | Backend + Frontend          | Media     | US-028, US-030         | 5          |
| [US-037](../historias/US-037-migrar-pasarela-culqi-a-stripe.md)           | Migrar la pasarela de pagos de Culqi a Stripe (test mode)    | Backend + Frontend + DevOps | Crítica   | US-019..US-026         | 8          |

> **US-037 es deuda técnica de EP-03 arrastrada a este sprint** (2026-08-09, [ADR-0011](../../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md)). Se incorpora acá, y no como historia suelta del Sprint 2 ya cerrado, porque **bloquea la precondición de este sprint**: el grafo de dependencias parte de "Sprint 2 cerrado: socios `ACTIVE` al día", y hoy ningún socio puede llegar a `ACTIVE` pagando (Culqi exige RUC, el cliente de cargos quedó como stub). Sin US-037 no se pueden cerrar A-15 ni P-10. No se reabre el Sprint 2: entregó lo que su alcance definía contra la decisión vigente en ese momento; la restricción externa se confirmó después de su cierre.

Estimación total: **57 puntos relativos** (49 de EP-04 + 8 de la deuda técnica US-037; Sprint 1 cerró con 45; Sprint 2 con 42).

Es el sprint más cargado del MVP porque EP-04 concentra trece endpoints y doce reglas de negocio simultáneas, y además arrastra la deuda técnica de la pasarela de pagos (US-037). La estimación es alta a propósito y se compensa con dos factores reales: EP-04 no incorpora ninguna integración externa (la única del sprint es US-037, que reemplaza una integración ya diseñada y probada en su forma, no una nueva) y los módulos de Terraform, el middleware de roles, la auditoría y la paginación ya están maduros desde los sprints anteriores. US-037 corre en paralelo desde la ola 1: no comparte recursos de Terraform ni módulos de dominio con las historias de reservas.

**Orden de sacrificio si la velocidad no alcanza:** US-036 y luego US-035 (ambas de prioridad Media) son las candidatas a diferirse a un sprint siguiente sin romper el Sprint Goal, porque son capacidades administrativas y no bloquean el recorrido del socio. **US-027 a US-034 y US-037 son innegociables**: sin las primeras no existe la reserva, y sin US-037 no existe un socio habilitado para reservar.

## Grafo de dependencias

```
US-037 (deuda técnica EP-03: pasarela Stripe) ──► habilita socios ACTIVE al día

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

- **Ola 1 (arranque, en paralelo):** US-027 (DevOps: trece endpoints, autorización por rol, permisos sobre GSI3). En paralelo, Backend implementa con pruebas unitarias el dominio puro que no depende del despliegue (generación de franjas horarias en `America/Lima`, cálculo de solapamientos, resolución de `endsAt` por `blockMinutes`, regla de las 24 horas, mes calendario del invitado), y Frontend construye el catálogo y el selector de franjas contra el contrato con datos simulados. **También arranca acá US-037** (migración a Stripe): toca parámetros SSM y Lambdas de pagos, recursos distintos de los de US-027, así que no compite por el mismo estado de Terraform ni bloquea a nadie.
- **Ola 2 (tras US-027):** US-028 (catálogo cargado y consultable) — es el dato maestro del que dependen todas las demás historias, así que se cierra primero y rápido.
- **Ola 3:** US-029 (disponibilidad) y US-030 (creación de reserva con validaciones base) en paralelo: comparten el mismo cálculo de solapamiento, que conviene extraer una sola vez y reutilizar.
- **Ola 4:** US-031 (participantes e invitados) sobre la creación ya funcionando, y en paralelo US-033 (mis reservas y cancelación) y US-034 (aprobación administrativa), que solo dependen de que exista la entidad `Reservation`.
- **Ola 5:** US-032 (flujo de reserva real en la interfaz) integrando disponibilidad, participantes y errores del contrato; en paralelo US-035 (mantenimiento) y US-036 (gestión de recursos y consola administrativa).
- **Ola 6 (verificación extremo a extremo):** demo del recorrido completo en `dev`: socio activo reserva una cancha → aparece en sus reservas → la cancela → la franja vuelve a estar libre; socio solicita una parrilla → el administrador la aprueba; socio con deuda intenta reservar → bloqueado con acceso al pago; administrador bloquea un recurso → la franja desaparece de la disponibilidad. Más las pruebas de concurrencia (misma franja, mismo invitado).

## Capacidad de trabajo paralelo

- Los contratos `docs/api/contratos-api.md` §4, §6 y §7 y los tipos y esquemas de `packages/shared-types/src/reservation.ts`, `packages/validation/src/reservation.ts` y `packages/validation/src/member.ts` están cerrados y versionados **antes** de arrancar el sprint, incluidas las tres decisiones funcionales: Frontend y Backend pueden desarrollar en paralelo desde el día 1 sin esperar al otro ni a una decisión pendiente.
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

- **Planning:** selección de US-027..US-036, confirmación del Sprint Goal y **repaso de las tres decisiones funcionales ya cerradas** de EP-04 (identificación de participantes por DNI, catálogo como ítems de Terraform, efecto del mantenimiento sobre reservas existentes), para que todo el equipo trabaje sobre el mismo contrato.
- **Daily:** foco en desbloquear la cadena US-027 → US-028 → US-030 y en el estado de las pruebas de concurrencia, que suelen aparecer tarde y son las que más riesgo esconden.
- **Review:** demostración extremo a extremo en `dev` del recorrido del socio y del administrador, incluidos los casos de rechazo (cruce, aforo, invitado sin cupo, deuda, mantenimiento).
- **Retrospective:** revisión del tamaño del sprint (49 puntos frente a 42–45 de velocidad observada) y ajustes antes de EP-05, que ya tiene deuda acumulada: siete eventos de notificación pendientes de los Sprints 1, 2 y 3.

## Decisiones funcionales resueltas (cerradas antes del sprint)

Las tres quedaron cerradas antes de empezar, así que ninguna historia arranca bloqueada y la Planning no necesita reabrirlas.

1. **Identificación del socio participante — resuelta** ([ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md), contrato §4). `GET /members/lookup?dni=` (member, admin), coincidencia exacta, devuelve solo `memberId`, `firstName` y `lastName`; 404 `DNI_NOT_FOUND` si no hay socio resoluble (incluidos `PENDING` y `REJECTED`). Se descartó `GET /members?dni=` con respuesta distinta por rol. **US-031 ya cumple la Definition of Ready completa.**
2. **Carga del catálogo de recursos — resuelta** ([ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md)). Ítems estáticos de Terraform (`aws_dynamodb_table_item`, uno por recurso) con `ignore_changes = [item]`: idempotente por construcción y sin revertir las ediciones de aforo/horario/estado del administrador. Lista exacta de los diez recursos y reparto de campos "Terraform vs. runtime" en US-028.
3. **Efecto del mantenimiento sobre reservas existentes — confirmada.** No se cancelan solas; el bloqueo impide reservas nuevas en toda la ventana y la respuesta 201 devuelve `affectedReservationCount`. Además, la disponibilidad devuelve `status=MAINTENANCE` en esas franjas (distinto de `RESERVED`) y `resourceStatus` a nivel de respuesta para el bloqueo indefinido (US-029, US-030, US-035, US-036).

Decisión adicional derivada de la primera (ADR-0009): el invitado externo tiene ahora **perfil persistente** (`GuestProfile`, modelo §3.15), resoluble con `GET /guests/lookup?dni=` y creado por _upsert_ idempotente dentro de la transacción de la reserva; gana el primer registro si dos socios escriben nombres distintos para el mismo DNI.

**Impacto en el Sprint Backlog** (sin cambio de estimaciones): US-027 pasa de once a trece endpoints (dos GET de lectura puntual, sin acceso a GSI); US-028 incorpora la nota bloqueante de permisos de `bootstrap`; US-031 gana los criterios de lookup y de alta de invitado; US-032 detalla el flujo de búsqueda por DNI; US-029/US-035/US-036 reflejan el estado por franja. El esquema `reservationParticipantInputSchema` cambia `name` por `firstName` + `lastName` para el participante `GUEST` (sin consumidores todavía).

## Aclaraciones de reglas incorporadas en este sprint

Estas no amplían el alcance: precisan reglas ya acordadas cuya interpretación estaba abierta y que, sin definirse, se resolverían improvisando durante la implementación.

- Una reserva `PENDING_APPROVAL` **ocupa la franja** desde su creación (US-029, US-030). Si no la ocupara, dos solicitudes de la misma parrilla y horario podrían aprobarse ambas, violando RN-RES-07.
- Se consideran **activas**, a efectos de cruces y disponibilidad, las reservas `CONFIRMED`, `PENDING_APPROVAL` y `APPROVED`; las `CANCELLED` y `REJECTED` no bloquean.
- El **rechazo administrativo** devuelve el cupo mensual de los invitados externos, igual que la cancelación (US-034): un invitado no debe perder una de sus dos visitas por una reserva que el club nunca aprobó. Nuevo caso R-29 en la matriz de trazabilidad.
- El borde de las **24 horas** se define como permitido cuando faltan 24 horas o más (US-033), y debe tener prueba de borde explícita.
- La restricción de RN-RES-12 (activo y sin deuda) aplica al **titular**, que es el responsable según RN-RES-06, no a los socios participantes (US-031). Extenderla a los participantes sería un cambio de regla que requiere aprobación del product owner.

## Notas para DevOps (US-027)

- **Permisos de escritura de ítems para el catálogo (US-028, bloqueante)**: el catálogo se carga con `aws_dynamodb_table_item`, y el rol de despliegue de CI **hoy no tiene** `dynamodb:PutItem`/`GetItem`/`DeleteItem` sobre `activa-club-dev` (solo sobre la tabla de _locks_). El rol de solo lectura que corre el `plan` necesita además `dynamodb:GetItem` sobre esa tabla para refrescar el estado del ítem. Aplicar `bootstrap` con credenciales elevadas **antes** de mergear el PR de US-028, o `deploy-dev.yml` falla con `AccessDenied`.
- **Permisos sobre GSI3**: es el primer sprint que consulta el tercer índice. Verificar que el ARN de índices usado en `environments/dev` cubre GSI3 y no solo los que usaban EP-02 y EP-03; de lo contrario las Lambdas de disponibilidad y de creación de reserva fallarán con `AccessDenied` en tiempo de ejecución, no en el `plan`.
- **Trece endpoints, no once**: se suman `GET /members/lookup` (nodo estático hermano de `members/{memberId}`, mismo patrón ya desplegado que `members/me`) y `GET /guests/lookup` (nodo de primer nivel nuevo). Ambos solo necesitan `GetItem` sobre la tabla, sin permisos de GSI, y conviene ponerles _throttling_ por método.
- **`TransactWriteItems`**: la creación de reserva escribe cabecera, participantes y contadores de invitado de forma atómica. Confirmar el permiso y recordar que DynamoDB exige la acción concreta para **cada** operación dentro de la transacción (ya pasó en US-016 y en el flujo de activación).
- **Rutas anidadas**: `DELETE /resources/{resourceId}/maintenance/{blockId}` es la primera ruta con dos parámetros de ruta. Verificar que `modules/endpoint` la soporta antes de la Ola 2.
- **Redespliegue del stage y CORS**: se agregan trece rutas de una vez. Verificarlo explícitamente antes de integrar el frontend; ya rompió la integración en los Sprints 1 y 2.
- **Sin secretos nuevos**: EP-04 no integra proveedores externos, así que no debería requerir cambios en `bootstrap`. Si aun así hiciera falta un permiso nuevo del rol de CI, aplicarlo con credenciales elevadas **antes** de mergear el PR.

## Riesgos del sprint

| Riesgo                                                                                              | Impacto                                                                          | Mitigación                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint sobredimensionado (57 puntos frente a una velocidad observada de 42–45)                      | Alto: historias a medias al cierre                                               | Orden de sacrificio explícito (US-036, luego US-035); revisión de avance a mitad de sprint; US-027 a US-034 y US-037 innegociables                                                                              |
| El renombrado de los parámetros SSM de pagos (US-037) los **destruye y recrea**                     | Alto: pagos fallando en `dev` hasta recargar los valores reales                  | Paso explícito de recarga (`aws ssm put-parameter --overwrite`) documentado en `docs/deployment/despliegue-dev.md` y como criterio 21 de US-037; verificar que no queden parámetros huérfanos con llaves reales |
| La cuenta Stripe de test no acepta `currency: 'pen'`                                                | Medio-Alto: bloquea la verificación en vivo de US-037                            | Validación previa obligatoria antes de implementar (ADR-0011, "Validaciones requeridas"); si falla, se escala al Product Owner y se resuelve con un ADR complementario, nunca cambiando el monto en silencio    |
| Doble reserva de la misma franja por concurrencia                                                   | Muy alto: dos socios en la misma cancha, error visible e indefendible en la demo | Escritura condicional/transaccional obligatoria en US-030; prueba de concurrencia explícita en la Ola 6, no al final                                                                                            |
| Contador mensual de invitado que supera 2 por reintentos o concurrencia                             | Alto: la regla de negocio deja de valer                                          | Incremento atómico con condición `visitCount < 2` (modelo §3.10); prueba de concurrencia con el mismo invitado                                                                                                  |
| Retraso de US-027 (trece endpoints + permisos sobre GSI3)                                           | Alto: bloquea todo el sprint                                                     | Priorizar en Ola 1; permitir dividir el despliegue en dos PR; avanzar el dominio puro con pruebas unitarias sin depender del despliegue                                                                         |
| Errores de zona horaria (`America/Lima` vs. UTC) en franjas, corte de 24 h y mes del invitado       | Alto: reservas fuera de horario, cancelaciones mal permitidas o denegadas        | Regla ya fijada en el modelo de datos §2; concentrar la conversión en una utilidad única probada en la Ola 1; pruebas de borde (06:00, cierre, cambio de mes)                                                   |
| Sondeo de DNIs contra `GET /members/lookup` para averiguar quién es socio                           | Medio: privacidad de terceros                                                    | Coincidencia exacta (sin enumeración por prefijo), respuesta de tres campos, 404 idéntico para "no existe" y "no es socio", endpoint autenticado y _throttling_ por método (ADR-0009)                           |
| Catálogo de recursos ausente o inconsistente entre ambientes                                        | Medio-Alto: nada se puede probar en `dev`                                        | Catálogo como ítems de Terraform definidos una sola vez para `dev` y `prd` (ADR-0010); idempotente por estado, no por script                                                                                    |
| `AccessDenied` al crear los ítems del catálogo desde CI                                             | Medio-Alto: US-028 bloqueada y el resto del sprint detrás                        | `bootstrap` aplicado antes de mergear US-028 con los permisos de ítem sobre la tabla (ver Notas para DevOps)                                                                                                    |
| Doble mecanismo de mantenimiento (`resourceStatus=MAINTENANCE` vs. `MaintenanceBlock`) mal aplicado | Medio: recurso bloqueado sin que nadie entienda por qué                          | Semántica definida en US-035 y US-036 (indefinido vs. ventana acotada); la interfaz debe indicar cuál está aplicando                                                                                            |
| Reglas críticas validadas solo en el frontend                                                       | Alto: se pueden saltar llamando a la API                                         | Criterio explícito en US-030, US-031 y US-032; pruebas de integración de API que llaman al endpoint sin pasar por la interfaz                                                                                   |
| Fuga de datos personales de terceros al mostrar participantes                                       | Medio: privacidad de socios ajenos                                               | Criterio 13 de US-031: solo nombre y apellido de los participantes, nunca correo, teléfono, DNI completo ni estado de membresía                                                                                 |
| Regresión de la capa de transporte al agregar trece rutas (CORS / stage)                            | Medio: integración rota como en los Sprints 1 y 2                                | Verificación explícita de CORS y redespliegue del stage en la Ola 2, antes de integrar el frontend                                                                                                              |
| Deuda acumulada de notificaciones (siete eventos de reserva pendientes)                             | Medio: EP-05 crece sprint a sprint                                               | Dejar el rastro de evento previsto por el contrato en cada acción; listar los eventos pendientes en la Retrospective para dimensionar EP-05                                                                     |
| Costos fuera de Free Tier al agregar once Lambdas y sus alarmas                                     | Bajo: presupuesto                                                                | Dimensionar mínimo, sin recursos siempre encendidos; revisar en el plan de Terraform                                                                                                                            |

## Historial de cambios

- 2026-08-09: Creación del Sprint 3 con las 10 historias de EP-04 (US-027..US-036).
- 2026-08-09: Cierre de las tres decisiones funcionales pendientes (ADR-0009, ADR-0010); dos endpoints de lookup por DNI, entidad `GuestProfile`, catálogo como ítems de Terraform y estado explícito por franja en la disponibilidad.
