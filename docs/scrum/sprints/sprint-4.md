# Sprint 4 — Notificaciones

| Campo             | Valor                                      |
| ----------------- | ------------------------------------------ |
| Sprint            | 4                                          |
| Nombre            | Notificaciones                             |
| Épica             | [EP-05](../epicas/EP-05-notificaciones.md) |
| Fase              | MVP                                        |
| Duración sugerida | 2 semanas                                  |
| Estado            | Planificado                                |

## Sprint Goal

Que el club **le hable a sus socios desde la plataforma**: cada socio recibe en su bandeja, y por correo, el aviso de lo que le pasa —cuenta activada, solicitud aprobada o rechazada, pago confirmado o rechazado, reserva confirmada, aprobada, rechazada o cancelada, mantenimiento que afecta su reserva, recordatorio del día anterior y membresía por vencer o vencida—, y el administrador publica avisos a todo el padrón, a un segmento o a un socio. De paso, **la membresía vence de verdad**: deja de existir el socio que sigue reservando con la membresía vencida.

## Alcance del sprint

Este sprint implementa lo clasificado como **MVP** en la sección 5 (Notificaciones) de `docs/product/matriz-de-alcance.md`, sobre los contratos de `docs/api/contratos-api.md` §8 y las entidades `Notification` y `MemberNotification` del modelo de datos (§3.12–3.13), ya definidas y sin uso hasta ahora.

Incluye además **US-038**, deuda técnica de EP-03 (el recálculo diario de `membershipStatus` por vencimiento), por el mismo motivo que US-037 entró al Sprint 3: bloquea la precondición de este sprint. Sin ella no hay socios "por vencer" ni "vencidos" a quienes avisar o segmentar, y un socio con la membresía vencida sigue pudiendo reservar.

**Fuera de este sprint:**

- WhatsApp y push (fase posterior) y SMS (fuera de alcance), matriz §5.
- Preferencias de notificación del socio, programación de publicaciones, adjuntos y lectura de acuse: no están en el Contexto Maestro.
- El cobro desatendido de la renovación automática: sigue como decisión pendiente de EP-03.
- Avisos recientes en el inicio del socio y métrica de notificaciones enviadas: EP-07 (Sprint 5).
- La **verificación extremo a extremo de EP-04** (Ola 6 del Sprint 3) no es una historia de este sprint, pero conviene cerrarla en la Ola 1, antes de que los eventos de reserva empiecen a emitir avisos (ver "Arrastre del Sprint 3").

## Sprint Backlog

| ID                                                                           | Título                                                                 | Responsable        | Prioridad | Depende de             | Estimación |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ | --------- | ---------------------- | ---------- |
| [US-038](../historias/US-038-actualizar-estado-membresia-por-vencimiento.md) | Actualizar el estado de la membresía según su vencimiento              | Backend + DevOps   | Crítica   | US-021                 | 3          |
| [US-039](../historias/US-039-provisionar-endpoints-notificaciones.md)        | Provisionar endpoints e infraestructura de notificaciones              | DevOps             | Crítica   | —                      | 5          |
| [US-040](../historias/US-040-emitir-notificaciones-eventos.md)               | Emitir notificaciones de eventos (bandeja interna y correo)            | Backend + DevOps   | Crítica   | US-039                 | 5          |
| [US-041](../historias/US-041-bandeja-notificaciones-socio.md)                | Consultar mi bandeja de notificaciones y marcarlas como leídas         | Backend + Frontend | Alta      | US-039, US-040         | 5          |
| [US-042](../historias/US-042-notificar-eventos-cuenta.md)                    | Notificar la activación de cuenta y la decisión sobre una solicitud    | Backend            | Alta      | US-040                 | 2          |
| [US-043](../historias/US-043-notificar-resultado-pagos.md)                   | Notificar el resultado de un pago                                      | Backend            | Alta      | US-040                 | 3          |
| [US-044](../historias/US-044-notificar-cambios-estado-reservas.md)           | Notificar los cambios de estado de una reserva                         | Backend            | Alta      | US-040                 | 3          |
| [US-045](../historias/US-045-notificar-mantenimiento-socios-afectados.md)    | Avisar a los socios afectados por un mantenimiento                     | Backend            | Media     | US-040                 | 3          |
| [US-046](../historias/US-046-recordatorio-reserva.md)                        | Recordar una reserva próxima                                           | Backend + DevOps   | Media     | US-040                 | 5          |
| [US-047](../historias/US-047-avisar-renovacion-proxima-vencida.md)           | Avisar que la membresía está por vencer o ya venció                    | Backend            | Media     | US-038, US-040         | 2          |
| [US-048](../historias/US-048-publicar-notificacion-segmentada.md)            | Publicar una notificación segmentada (servidor)                        | Backend            | Alta      | US-038, US-039, US-040 | 5          |
| [US-049](../historias/US-049-consola-admin-notificaciones.md)                | Publicar y consultar notificaciones desde la consola de administración | Backend + Frontend | Alta      | US-048                 | 5          |

> **US-038 es deuda técnica de EP-03**, no una historia de notificaciones (ver su sección "Contexto"). Se planifica aquí porque EP-05 (avisos de renovación, segmentos) y EP-07 (dashboards) dependen de un `membershipStatus` que hoy no cambia con el paso del tiempo, y porque corrige un hueco de RN-PAG-06/RN-RES-12 que deja reservar a socios vencidos.

Estimación total: **46 puntos relativos** (43 de EP-05 + 3 de la deuda técnica US-038). Velocidad observada: 42 (Sprint 2), 45 (Sprint 1) y 57 planificados en el Sprint 3, que se cerró en dos tramos.

La carga es alta pero mejor repartida que la del Sprint 3: seis de las doce historias son de 2 o 3 puntos y casi todas solo dependen de US-040, así que se pueden repartir entre varias personas en la misma ola. La única integración externa es SES, ya decidida en ADR-0006 y con la identidad provisionada desde el Sprint 0.

**Orden de sacrificio si la velocidad no alcanza:** US-046 (recordatorio, el único proceso programado nuevo además de US-038) y luego US-045 (mantenimiento) pueden pasar al Sprint 5 sin romper el Sprint Goal. **US-038 a US-044 y US-048 son innegociables**: sin ellas no hay bandeja, no hay avisos de los módulos ya entregados y el administrador no puede comunicarse con los socios.

## Grafo de dependencias

```
US-038 (deuda EP-03: membresía vence de verdad) ──┬──► US-047
                                                  └──► US-048
US-039 ──► US-040 ──┬──► US-041
   │                ├──► US-042
   │                ├──► US-043
   │                ├──► US-044
   │                ├──► US-045
   │                ├──► US-046
   │                ├──► US-047
   │                └──► US-048 ──► US-049
   └──────────────────────► US-041, US-048 (endpoints)
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (arranque, en paralelo):** US-039 (DevOps: cuatro endpoints, `ses:SendEmail` acotado a la identidad, permisos de las Lambdas que emiten eventos). En paralelo, **US-038** (Backend + DevOps: proceso diario y defensa por fecha en la reserva), que no comparte recursos con US-039. Backend escribe con pruebas unitarias los trece textos de US-040 y la lógica pura de resolución de segmentos; Frontend construye la bandeja y el formulario de publicación contra el contrato con datos simulados. **Cierre de la Ola 6 del Sprint 3** (verificación extremo a extremo de reservas).
- **Ola 2 (tras US-039):** US-040 (emisión centralizada y plantillas SES). Es el cuello de botella del sprint: se cierra primero y rápido.
- **Ola 3 (tras US-040, todo en paralelo):** US-041 (bandeja), US-042 (cuenta), US-043 (pagos), US-044 (reservas) y US-045 (mantenimiento). Son independientes entre sí y tocan Lambdas distintas.
- **Ola 4:** US-047 (renovación, sobre US-038 ya en `dev`), US-046 (recordatorio) y US-048 (publicación segmentada).
- **Ola 5:** US-049 (consola del administrador e historial de enviados).
- **Ola 6 (verificación extremo a extremo):** en `dev`, con socios de prueba de correo verificado en SES: activar una cuenta → aviso de bienvenida; pagar → aviso de pago; reservar una cancha → aviso de confirmación; pedir una parrilla → el administrador la rechaza → aviso con motivo; bloquear la cancha por mantenimiento → aviso al titular; forzar el vencimiento de un socio → aviso de vencida y reserva rechazada; publicar un aviso al segmento con deuda → llega solo a ellos.

## Capacidad de trabajo paralelo

- Los contratos de §8, el esquema `createNotificationSchema`, los tipos de `packages/shared-types/src/notification.ts` y las claves de `Notification`/`MemberNotification` en `apps/api/src/lib/dynamo.ts` ya existen: Frontend y Backend arrancan el día 1 sin esperar al otro.
- La separación entre US-040 (cómo se emite) y US-042..US-047 (cuándo y a quién) es deliberada: evita seis implementaciones del mismo envío y permite repartir los eventos por módulo entre personas distintas.
- La separación entre US-048 (servidor) y US-049 (consola) repite el patrón de US-030/US-032 del Sprint 3.
- US-038 y US-039 no comparten recursos de Terraform ni módulos de dominio: corren a la vez en la Ola 1.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- Los trece eventos de `NotificationEvent` dejan un aviso en la bandeja del socio afectado y disparan el correo; un fallo de correo no rompe ninguna operación.
- Ningún hecho genera dos avisos: pagos confirmados por respuesta síncrona y webhook, procesos programados ejecutados dos veces y decisiones concurrentes de dos administradores emiten uno solo.
- Un socio con la membresía vencida no puede reservar, se haya ejecutado o no el proceso diario de ese día.
- El administrador publica a los siete segmentos y cada aviso llega exactamente a quien corresponde, con auditoría `NOTIFICATION_SENT`.
- Los casos N-01..N-12, A-07, P-11 y R-21 de `docs/testing/matriz-trazabilidad.md` quedan cubiertos.
- No se introdujo alcance fuera del MVP de la sección 5 de la matriz de alcance.

## Ceremonias

- **Planning:** selección de US-038..US-049, confirmación del Sprint Goal y **resolución de las preguntas abiertas de EP-05** que afectan criterios: umbral de "por vencer" (1), vencimiento sin deuda (2), momento del recordatorio (8), definición de segmentos (10), segmento vacío (11) y patrón de acceso de segmentos por membresía (12). Las demás pueden resolverse durante el sprint con la propuesta por defecto.
- **Daily:** foco en desbloquear la cadena US-039 → US-040 y en la idempotencia de los avisos, que es donde se esconden los defectos.
- **Review:** demostración extremo a extremo en `dev` del recorrido de la Ola 6, mostrando bandeja y correo recibido.
- **Retrospective:** revisión del tamaño del sprint frente a la velocidad, y de la conveniencia de seguir arrastrando deuda técnica de épicas cerradas (US-037, US-038, US-050) en sprints de épicas nuevas.

## Arrastre del Sprint 3

La verificación extremo a extremo de EP-04 (Ola 6 del Sprint 3) sigue pendiente. Se recomienda cerrarla en la Ola 1 de este sprint, **antes** de que US-044 y US-045 agreguen avisos a las Lambdas de reservas: si aparece un defecto, es mejor corregirlo sin el ruido de los efectos laterales nuevos.

## Notas para DevOps (US-038, US-039, US-046)

- **Permiso de SES**: es el primer sprint que envía correos. `ses:SendEmail` acotado al ARN de la identidad del ambiente (`module.ses.identity_arn`), nunca `ses:*`. Si el rol de CI necesita leer o crear plantillas SES, aplicar `bootstrap` con credenciales elevadas **antes** de mergear.
- **Plantillas SES** (US-040): una por evento, en Terraform. Verificar que `terraform plan` no intente recrearlas en cada ejecución.
- **Procesos programados** (US-038, US-046): son los primeros del proyecto. La hora se expresa en `America/Lima`; si el servicio programador elegido solo acepta UTC, documentar la conversión (Lima no tiene horario de verano, UTC-5 fijo). Sin recursos siempre encendidos.
- **Rutas nuevas**: `notifications/sent` (estático) y `notifications/{notificationId}/read` (parámetro) bajo el mismo nodo. Verificar la prioridad del segmento estático, igual que `members/me` y `members/lookup`.
- **Redespliegue del stage y CORS** tras agregar rutas: verificar explícitamente antes de integrar el frontend, como en cada sprint anterior.
- **SES en sandbox**: documentar en `docs/deployment/despliegue-dev.md` cómo verificar destinatarios de prueba para la demo.

## Riesgos del sprint

- **Avisos duplicados por convergencia o reintento** (pagos síncrono + webhook, procesos programados, decisiones concurrentes). Impacto alto: socios que reciben dos correos de "pago confirmado" quitan credibilidad a la demo. Mitigación: idempotencia exigida en US-040 (criterio 8) y en cada historia de evento; pruebas explícitas de convergencia.
- **El webhook de Stripe responde error por un fallo de notificación** y Stripe reintenta. Impacto medio-alto: reintentos y posibles avisos repetidos. Mitigación: criterio 7 de US-043; la notificación nunca altera la respuesta al proveedor.
- **Límites del sandbox de SES** (solo destinatarios verificados, tasa de envío). Impacto medio: correos que no llegan en la demo o publicaciones masivas lentas. Mitigación: socios de prueba verificados; el correo es _best-effort_ y la bandeja es la fuente obligatoria.
- **Resolución de segmentos por situación de membresía sin índice propio**. Impacto medio: lecturas más caras de lo previsto. Mitigación: decisión del Arquitecto en la Planning (pregunta abierta 12 de EP-05); volumen mock pequeño.
- **Errores de zona horaria en procesos programados** (vencimientos, recordatorio del día siguiente). Impacto alto: avisos el día equivocado o membresías vencidas un día antes. Mitigación: reutilizar la utilidad de fechas de Lima de EP-04; pruebas de borde de medianoche.
- **Fuga de datos en textos de avisos** (DNI, datos de tarjeta, datos de participantes). Impacto alto: privacidad. Mitigación: criterio 4 de US-040; revisión de los trece textos en el PR (T-04).
- **Regresión en Lambdas ya cerradas** al agregarles la emisión de eventos (activación, pagos, reservas). Impacto alto. Mitigación: la emisión va después de la operación y nunca cambia su respuesta; las pruebas existentes de esas Lambdas deben seguir pasando sin cambios.
- **Sprint por encima de la velocidad observada** (46 puntos). Impacto medio. Mitigación: orden de sacrificio explícito (US-046, luego US-045).

## Historial de cambios

- 2026-10-11: Creación del Sprint 4 con las historias de EP-05 (US-039..US-049) y la deuda técnica US-038 de EP-03.
- 2026-10-12: US-038 implementada (Ola 1), pendiente verificación en `dev`. Primer proceso programado del proyecto: módulo Terraform `scheduled-job` reutilizable para US-046.
- 2026-10-12: US-039 con infraestructura desplegada, pendiente lógica: cuatro endpoints de notificaciones y `ses:SendEmail` para las Lambdas emisoras (Ola 1). Desbloquea US-040.
- 2026-10-12: US-041 implementada (bandeja del socio, backend y frontend), pendiente verificación en dev.
- 2026-10-12: US-040 implementada (módulo `notifications` del backend), pendiente consumo por US-042..US-047. Desvío: correo sin plantillas SES (generado en código con `ses:SendEmail`).
- 2026-10-12: US-043 implementada (Ola 3): avisos del resultado de un pago desde `POST /payments` y el webhook, primera historia que consume el motor de US-040.
- 2026-10-12: US-045 implementada (avisos de mantenimiento a los socios afectados, best-effort y acotados por petición), pendiente verificación en `dev`.
- 2026-10-12: US-046 implementada (proceso programado de recordatorio de reservas, 18:00 America/Lima; reutiliza `scheduled-job`, con alarma de errores), pendiente verificación en `dev`.
- 2026-10-12: US-044 implementada (Ola 3): avisos de reserva confirmada, aprobada, rechazada y cancelada al titular, sin cambios de API ni de IAM. Pendiente verificación en `dev`.
- 2026-10-12: US-042 implementada (avisos de activación de cuenta y de decisión sobre la solicitud; sin cambios de infraestructura).
- 2026-10-12: US-048 implementada (`POST /notifications` y `GET /notifications/sent`): segmentos sin Scan, bandejas en bloques de 100 con reintento idempotente, correo acotado (15 por publicación, 1/s, 22 s), códigos `NO_RECIPIENTS` y `RECIPIENT_LIMIT_EXCEEDED`. Sin cambios de Terraform. Pendiente verificación en `dev` y la consola (US-049).
- 2026-10-12: US-049 implementada (interfaz): `/admin/notificaciones` con pestañas "Publicar" (formulario con confirmación y resumen del resultado) y "Enviadas" (historial con "Cargar más" y panel de detalle). Solo frontend, sin cambios de contrato ni de Terraform. Pendiente verificación en `dev`.
