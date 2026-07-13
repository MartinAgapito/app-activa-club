# Reglas de Negocio — Activa Club

> Derivado del [Contexto Maestro](./contexto-maestro.md). Las reglas se identifican con prefijo `RN-` por módulo para trazabilidad hacia historias, criterios de aceptación y pruebas. Las reglas críticas deben validarse en el backend, nunca solo en el frontend.

## Módulo 1 — Migración (RN-MIG)

| ID | Regla |
|----|-------|
| RN-MIG-01 | La información inicial proviene de un archivo JSON mock que representa el sistema on-premise. |
| RN-MIG-02 | La carga inicial migra los datos hacia Amazon DynamoDB. |
| RN-MIG-03 | Solo se migran socios, membresías, saldo pendiente resumido y estado legado. |
| RN-MIG-04 | No se migran pagos históricos detallados ni reservas históricas. |
| RN-MIG-05 | Cada socio migrado mantiene un identificador legado para trazabilidad. |
| RN-MIG-06 | Después de la migración, DynamoDB es la fuente de datos operativa del sistema. |

## Módulo 2 — Activación y registro (RN-ACT)

| ID | Regla |
|----|-------|
| RN-ACT-01 | Un socio migrado activa su cuenta usando su DNI. |
| RN-ACT-02 | El DNI valida identidad y evita duplicidad. |
| RN-ACT-03 | Un DNI solo puede asociarse a una cuenta digital. |
| RN-ACT-04 | El inicio de sesión se realiza con correo electrónico y contraseña. |
| RN-ACT-05 | Si una persona no figura en la data on-premise, puede registrarse como socio nuevo. |
| RN-ACT-06 | Un socio nuevo queda en estado pendiente hasta ser aprobado o rechazado por un administrador. |
| RN-ACT-07 | Tras la aprobación, el socio nuevo debe pagar su primera membresía para quedar activo y poder reservar. |

## Módulo 3 — Membresías y pagos (RN-PAG)

| ID | Regla |
|----|-------|
| RN-PAG-01 | Existen membresías mensual y anual. |
| RN-PAG-02 | La membresía anual contempla facilidades de pago con tarjeta, sujeto a la integración disponible. |
| RN-PAG-03 | La renovación automática es opcional y requiere autorización explícita del socio. |
| RN-PAG-04 | Todos los pagos son digitales mediante Culqi sandbox y tarjetas. |
| RN-PAG-05 | No se incluyen pagos manuales, efectivo, Yape, Plin ni transferencias. |
| RN-PAG-06 | Un socio con deuda o membresía vencida puede iniciar sesión y pagar, pero no puede reservar. |
| RN-PAG-07 | Los pagos actualizan el estado de membresía solo cuando se confirme el resultado de forma segura. |
| RN-PAG-08 | Nunca se almacenan datos de tarjeta, CVV ni secretos de Culqi. |

## Módulo 4 — Reservas (RN-RES)

### Recursos mock iniciales

| Recurso | Cantidad | Duración de bloque | Capacidad | Confirmación |
|---------|----------|--------------------|-----------|--------------|
| Fútbol | 2 canchas | 90 minutos | 14 participantes | Automática |
| Tenis | 2 canchas | 60 minutos | 4 participantes | Automática |
| Pádel | 2 canchas | 90 minutos | 4 participantes | Automática |
| Piscina | 1 | 2 horas (franjas) | Titular + 4 invitados | Automática |
| Parrillas | 2 zonas | 5 horas | 12 participantes | Aprobación admin |
| Salón social | 1 | 4 horas | 30 participantes | Aprobación admin |

### Horarios mock

| Ámbito | Horario |
|--------|---------|
| Club | Lunes a domingo, 06:00 a 22:00 |
| Piscina | 08:00 a 20:00 |
| Parrillas y salón social | 10:00 a 22:00 |

### Reglas de reserva

| ID | Regla |
|----|-------|
| RN-RES-01 | Fútbol, tenis, pádel y piscina se confirman automáticamente si hay disponibilidad. |
| RN-RES-02 | Parrillas y salón social requieren aprobación administrativa. |
| RN-RES-03 | Se pueden agregar otros socios e invitados externos a una reserva. |
| RN-RES-04 | Los invitados externos pueden asistir a todos los espacios, incluida la piscina. |
| RN-RES-05 | Cada invitado externo puede asistir como máximo dos veces al mes. |
| RN-RES-06 | El socio titular es responsable de los participantes de su reserva. |
| RN-RES-07 | No se permiten cruces de horario para un mismo recurso. |
| RN-RES-08 | No se permite que un socio o invitado participe en reservas que se superponen. |
| RN-RES-09 | No se puede superar la capacidad del recurso. |
| RN-RES-10 | Un socio puede cancelar hasta 24 horas antes del inicio de la reserva. |
| RN-RES-11 | El administrador puede bloquear temporalmente recursos por mantenimiento. |
| RN-RES-12 | Solo socios activos y sin deuda pueden reservar. |

## Módulo 5 — Notificaciones (RN-NOT)

| ID | Regla |
|----|-------|
| RN-NOT-01 | Las notificaciones internas son obligatorias en el MVP. |
| RN-NOT-02 | Se envían correos transaccionales para eventos relevantes. |
| RN-NOT-03 | El administrador puede segmentar destinatarios: todos, activos, con deuda, vencidos, próximos a vencer, un socio específico, o socios con reserva en un recurso. |
| RN-NOT-04 | Eventos automáticos: activación de cuenta; aprobación/rechazo de solicitud; pago exitoso o fallido; renovación próxima o vencida; reserva confirmada, cancelada, aprobada o rechazada; recurso en mantenimiento; recordatorio de reserva. |

## Módulo 6 — Administración (RN-ADM)

| ID | Regla |
|----|-------|
| RN-ADM-01 | El administrador gestiona socios migrados y nuevos. |
| RN-ADM-02 | El administrador aprueba o rechaza solicitudes de socio nuevo. |
| RN-ADM-03 | El administrador consulta estados de membresía y deudas. |
| RN-ADM-04 | El administrador gestiona recursos, aforo, horarios y mantenimiento. |
| RN-ADM-05 | El administrador consulta, aprueba o rechaza reservas de parrillas y salón social. |
| RN-ADM-06 | El administrador publica notificaciones masivas, segmentadas o individuales. |
| RN-ADM-07 | El administrador consulta pagos y reservas. |
| RN-ADM-08 | El administrador consulta dashboards y métricas. |

## Módulo 7 — Analytics (RN-ANL)

| ID | Regla |
|----|-------|
| RN-ANL-01 | El dashboard administrativo muestra socios por estado. |
| RN-ANL-02 | Muestra membresías próximas a vencer. |
| RN-ANL-03 | Muestra reservas por instalación. |
| RN-ANL-04 | Muestra reservas por día y horario. |
| RN-ANL-05 | Muestra reservas pendientes de aprobación. |
| RN-ANL-06 | Muestra pagos exitosos y fallidos. |
| RN-ANL-07 | Muestra ocupación de instalaciones. |
| RN-ANL-08 | Muestra notificaciones enviadas. |

## Estados clave del dominio (referencia funcional)

> Los nombres definitivos de estados y campos los define el Arquitecto en el modelo de datos (US-003). Esta lista es funcional, no técnica.

- **Estado de socio**: migrado, pendiente, aprobado, rechazado, activo.
- **Estado de membresía**: activa, próxima a vencer, vencida, con deuda pendiente.
- **Estado de reserva**: confirmada, pendiente de aprobación, aprobada, rechazada, cancelada.
- **Estado de pago**: exitoso, fallido, pendiente de confirmación.
- **Estado de recurso**: disponible, en mantenimiento/bloqueado.

## Historial de cambios

- 2026-07-09: Versión inicial derivada del Contexto Maestro (US-001, EP-01).
