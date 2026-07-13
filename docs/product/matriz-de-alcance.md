# Matriz de Alcance — Activa Club

> Derivada del [Contexto Maestro](./contexto-maestro.md). Clasifica cada capacidad en **MVP**, **Fase posterior** o **Fuera de alcance**. Cualquier cambio de clasificación requiere aprobación explícita del product owner y actualización del Contexto Maestro por el guardián de contexto.

## Leyenda

- **MVP**: entra en el alcance actual. Debe tener historia de usuario y criterios de aceptación.
- **Fase posterior**: acordado como deseable, pero pospuesto. No se implementa sin aprobación explícita.
- **Fuera de alcance**: explícitamente excluido del proyecto.

## 1. Migración on-premise

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Carga inicial desde JSON mock hacia DynamoDB | MVP | El JSON representa el sistema on-premise |
| Migrar socios, membresías, saldo pendiente resumido y estado legado | MVP | |
| Identificador legado por socio para trazabilidad | MVP | |
| Migrar pagos históricos detallados | Fuera de alcance | |
| Migrar reservas históricas | Fuera de alcance | |
| Sincronización continua/bidireccional con el on-premise | Fuera de alcance | Tras la migración, DynamoDB es la fuente operativa |

## 2. Activación y registro

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Activación de cuenta de socio migrado con DNI | MVP | Un DNI, una cuenta digital |
| Login con correo y contraseña | MVP | Vía Amazon Cognito |
| Recuperación de contraseña | MVP | |
| Registro de socio nuevo (estado pendiente) | MVP | |
| Aprobación/rechazo administrativo de socio nuevo | MVP | |
| Perfiles de usuario | MVP | |
| Registro social / OAuth externo (Google, etc.) | Fuera de alcance | |
| Verificación de identidad por terceros (biometría, RENIEC) | Fuera de alcance | El DNI se valida contra la data migrada |

## 3. Membresías y pagos

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Membresía mensual y anual | MVP | |
| Pago con tarjeta vía Culqi sandbox | MVP | |
| Actualización de estado de membresía tras confirmación segura del pago | MVP | |
| Bloqueo de reservas para socios con deuda o membresía vencida | MVP | Puede iniciar sesión y pagar, no reservar |
| Facilidades de pago de la anual con tarjeta | MVP | Sujeto a integración disponible |
| Renovación automática opcional con autorización explícita | MVP | Opt-in del socio |
| Pagos en efectivo, Yape, Plin, transferencias | Fuera de alcance | |
| Pagos manuales registrados por administrador | Fuera de alcance | |
| Facturación electrónica / integración tributaria | Fuera de alcance | |

## 4. Reservas

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Reserva de fútbol, tenis, pádel y piscina (confirmación automática) | MVP | |
| Reserva de parrillas y salón social (aprobación admin) | MVP | |
| Reglas de aforo, duración de bloques y horarios por recurso | MVP | |
| Participación de otros socios e invitados externos | MVP | Invitado externo máximo 2 veces al mes |
| Prevención de cruces de horario y superposición de participantes | MVP | |
| Cancelación hasta 24 horas antes | MVP | |
| Bloqueo temporal de recursos por mantenimiento | MVP | |
| Restricción de reserva solo a socios activos sin deuda | MVP | |
| Lista de espera para recursos ocupados | Fase posterior | |
| Check-in por código QR | Fase posterior | |
| Reservas recurrentes / suscripción a horarios fijos | Fase posterior | |
| Cobro por reserva de invitados externos | Fuera de alcance | No acordado en el MVP |

## 5. Notificaciones

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Notificaciones internas obligatorias | MVP | |
| Correos transaccionales para eventos relevantes | MVP | Vía Amazon SES |
| Segmentación (todos, activos, con deuda, vencidos, próximos a vencer, individual, por recurso) | MVP | |
| Eventos automáticos (activación, aprobación, pago, renovación, reserva, mantenimiento, recordatorio) | MVP | |
| Notificaciones por WhatsApp | Fase posterior | |
| Notificaciones push móviles | Fase posterior | |
| SMS | Fuera de alcance | |

## 6. Administración

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Gestión de socios migrados y nuevos | MVP | |
| Aprobación/rechazo de solicitudes de socio | MVP | |
| Consulta de estados de membresía y deudas | MVP | |
| Gestión de recursos, aforo, horarios y mantenimiento | MVP | |
| Aprobación/rechazo de reservas de parrillas y salón social | MVP | |
| Publicación de notificaciones masivas, segmentadas o individuales | MVP | |
| Consulta de pagos y reservas | MVP | |
| Consulta de dashboards y métricas | MVP | |
| Gestión de múltiples administradores con roles diferenciados | Fase posterior | El diseño debe permitirlo, pero no se implementa en el MVP |
| Auditoría avanzada / bitácora exportable | Fase posterior | |

## 7. Dashboards y analítica

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Dashboard personal del socio (Home) | MVP | |
| Dashboard administrativo con métricas del MVP | MVP | Socios por estado, vencimientos, reservas, pagos, ocupación, notificaciones |
| Predicciones / analítica avanzada con IA | Fase posterior | |
| Recomendaciones personalizadas | Fase posterior | |
| Exportación de reportes (PDF/Excel) | Fase posterior | |

## 8. Capacidades transversales pospuestas

| Capacidad | Clasificación | Nota |
|-----------|---------------|------|
| Inteligencia artificial (cualquier uso) | Fase posterior | |
| Aplicación móvil nativa | Fase posterior | El MVP es web responsive |
| Multi-club / multi-tenant | Fuera de alcance | |
| Módulo de e-commerce / tienda | Fuera de alcance | |

## Historial de cambios

- 2026-07-09: Versión inicial derivada del Contexto Maestro (US-001, EP-01).
