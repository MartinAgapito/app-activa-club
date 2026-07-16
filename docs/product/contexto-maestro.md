# Contexto Maestro — Activa Club

> Fuente única de verdad sobre alcance, reglas de negocio y stack acordado para el proyecto Activa Club. Cualquier cambio a este documento debe ser aprobado explícitamente por el usuario/product owner y quedar registrado en el historial de cambios al final del archivo.

Activa Club es una plataforma web responsive para modernizar un club deportivo privado que actualmente trabaja con un sistema on-premise. El nuevo sistema permitirá a socios y administradores gestionar operaciones desde cualquier ubicación mediante una arquitectura cloud en AWS.

## Objetivo del proyecto

Demostrar la migración de información de un sistema on-premise a AWS y habilitar una experiencia digital para socios: activación de cuenta, membresías, pagos, reservas, notificaciones y dashboards.

El producto se llama exactamente: Activa Club.

## Usuarios y roles

Existen dos roles iniciales:

1. Socio (`member`)
2. Administrador (`admin`)

El diseño debe permitir agregar múltiples administradores más adelante.

## Funcionalidades acordadas

### Migración on-premise

- La información inicial proviene de un archivo JSON mock.
- El JSON representa el sistema on-premise de Activa Club.
- La carga inicial migra los datos hacia Amazon DynamoDB.
- Solo se migran socios, membresías, saldo pendiente resumido y estado legado.
- No se migran pagos históricos detallados ni reservas históricas.
- Cada socio migrado mantiene un identificador legado para trazabilidad.
- Después de la migración, DynamoDB será la fuente de datos operativa del sistema.

### Activación y registro

- Un socio migrado activa su cuenta usando su DNI.
- El DNI se usa para validar identidad y evitar duplicidad.
- El inicio de sesión se realiza con correo electrónico y contraseña.
- Un DNI solo puede asociarse a una cuenta digital.
- Si una persona no figura en la data on-premise, puede registrarse como socio nuevo.
- Un socio nuevo queda en estado pendiente hasta ser aprobado o rechazado por un administrador.
- Después de la aprobación, el nuevo socio debe pagar su primera membresía para quedar activo y poder reservar.

### Membresías y pagos

- Existen membresías mensual y anual.
- La membresía anual contempla facilidades de pago mediante tarjeta, sujeto a la integración disponible.
- La renovación automática es opcional y debe requerir autorización explícita del socio.
- Todos los pagos son digitales mediante Culqi sandbox y tarjetas.
- No se incluyen pagos manuales, efectivo, Yape, Plin ni transferencias.
- Un socio con deuda o membresía vencida puede iniciar sesión y pagar, pero no puede reservar.
- Los pagos actualizan el estado de membresía solo cuando se confirme el resultado de forma segura.

### Reservas

Recursos iniciales mock:

- Dos canchas de fútbol.
- Una piscina.
- Dos canchas de tenis.
- Dos canchas de pádel.
- Dos zonas de parrillas.
- Un salón social.

Reglas:

- Fútbol: bloques de 90 minutos, hasta 14 participantes.
- Tenis: bloques de 60 minutos, hasta 4 participantes.
- Pádel: bloques de 90 minutos, hasta 4 participantes.
- Piscina: franjas de 2 horas, titular y hasta 4 invitados.
- Parrillas: bloques de 5 horas, hasta 12 participantes.
- Salón social: bloques de 4 horas, hasta 30 participantes.
- Fútbol, tenis, pádel y piscina se confirman automáticamente si hay disponibilidad.
- Parrillas y salón social requieren aprobación administrativa.
- Se pueden agregar otros socios e invitados externos.
- Los invitados externos pueden asistir a todos los espacios, incluida la piscina.
- Cada invitado externo puede asistir como máximo dos veces al mes.
- Un socio titular es responsable de los participantes de su reserva.
- No se permiten cruces de horario para un mismo recurso.
- No se permite que un socio o invitado participe en reservas que se superponen.
- No se puede superar la capacidad del recurso.
- Un socio puede cancelar hasta 24 horas antes del inicio de la reserva.
- El administrador puede bloquear temporalmente recursos por mantenimiento.
- Solo socios activos y sin deuda pueden reservar.

Horario inicial mock:

- Club: lunes a domingo, de 06:00 a 22:00.
- Piscina: de 08:00 a 20:00.
- Parrillas y salón social: de 10:00 a 22:00.

### Dashboard del socio

El Home del socio funciona como dashboard personal e incluye:

- Bienvenida personalizada.
- Estado de membresía: activa, próxima a vencer, vencida o con deuda pendiente.
- Tipo y fecha de vencimiento de membresía.
- Días restantes cuando corresponda.
- Acciones destacadas: renovar/pagar membresía y nueva reserva.
- Alertas de pago cuando no pueda reservar.
- Próximas reservas y sus estados.
- Accesos a fútbol, piscina, tenis, pádel, parrillas y área social.
- Notificaciones y novedades recientes.
- Resumen breve de pagos y reservas.

### Administración

El administrador puede:

- Gestionar socios migrados y nuevos.
- Aprobar o rechazar nuevas solicitudes de socio.
- Consultar estados de membresía y deudas.
- Gestionar recursos, aforo, horarios y mantenimiento.
- Consultar, aprobar o rechazar reservas de parrillas y salón social.
- Publicar notificaciones masivas, segmentadas o individuales.
- Consultar pagos y reservas.
- Consultar dashboards y métricas.

### Notificaciones

MVP:

- Notificaciones internas obligatorias.
- Correos transaccionales para eventos relevantes.

El administrador puede enviar notificaciones a:

- Todos los socios.
- Socios activos.
- Socios con deuda.
- Socios vencidos.
- Socios próximos a vencer.
- Un socio específico.
- Socios con reserva en un recurso específico.

Eventos automáticos:

- Activación de cuenta.
- Aprobación/rechazo de solicitud.
- Pago exitoso o fallido.
- Renovación próxima o vencida.
- Reserva confirmada, cancelada, aprobada o rechazada.
- Recurso en mantenimiento.
- Recordatorio de reserva.

### Analytics MVP

Dashboard administrativo con:

- Socios por estado.
- Membresías próximas a vencer.
- Reservas por instalación.
- Reservas por día y horario.
- Reservas pendientes de aprobación.
- Pagos exitosos y fallidos.
- Ocupación de instalaciones.
- Notificaciones enviadas.

## Arquitectura y stack acordados

- Monorepo en GitHub.
- Frontend: React, TypeScript, Vite, Tailwind CSS.
- Formularios: React Hook Form y Zod.
- Datos remotos: TanStack Query.
- Backend: Node.js y TypeScript sobre AWS Lambda.
- API: Amazon API Gateway, estilo REST.
- Autenticación: Amazon Cognito.
- Base de datos: Amazon DynamoDB.
- Archivos y JSON de migración: Amazon S3.
- Correos: Amazon SES.
- Pagos: Culqi en entorno sandbox.
- Logs y monitoreo: Amazon CloudWatch.
- Infraestructura como código: Terraform.
- CI/CD: GitHub Actions con OIDC hacia AWS.
- Pruebas: Vitest, React Testing Library y Playwright.
- Calidad: ESLint, Prettier y TypeScript estricto.

## Estructura conceptual del monorepo

- `apps/web`: frontend React.
- `apps/api`: backend serverless y lógica de negocio.
- `packages/shared-types`: contratos y tipos compartidos.
- `packages/validation`: esquemas de validación compartidos.
- `packages/ui`: componentes reutilizables, si se requieren.
- `infrastructure/terraform`: infraestructura AWS.
- `docs/product`: visión y reglas de negocio.
- `docs/scrum`: épicas, historias, sprints y definiciones Scrum.
- `docs/architecture`: ADRs, diagramas y decisiones técnicas.
- `docs/api`: contratos de API.
- `docs/data`: modelo de datos, migración y diccionario.
- `docs/security`: seguridad, roles y permisos.
- `docs/testing`: estrategia, casos y evidencias.
- `docs/deployment`: guía de entornos, CI/CD y despliegues.
- `mock-data`: archivo JSON on-premise.

## Metodología Scrum

- Toda funcionalidad debe partir de una historia de usuario aprobada.
- Las historias deben incluir criterios de aceptación verificables.
- Debe existir trazabilidad entre épica, historia, tarea, código, pruebas y Pull Request.
- No se implementa código fuera del alcance del MVP sin aprobación explícita.
- MVP primero; IA, QR, lista de espera, WhatsApp y predicciones quedan para fases posteriores.

## Normas de ingeniería

- No inventar tablas, atributos DynamoDB, índices, endpoints o contratos.
- Documentar contratos antes de implementar integración frontend-backend.
- Ninguna regla crítica debe depender únicamente del frontend.
- Nunca guardar contraseñas en DynamoDB.
- Nunca almacenar datos de tarjeta, CVV ni secretos de Culqi.
- Usar validación de entrada, autorización por rol y logging estructurado.
- Priorizar bajo costo, seguridad, serverless y simplicidad para el MVP.
- Toda infraestructura AWS debe existir en Terraform; no se deben requerir cambios manuales en la consola.
- GitHub Actions debe usar OIDC y no claves AWS estáticas.
- Los commits deben seguir Conventional Commits.

## Historial de cambios

- 2026-07-09: Versión inicial del Contexto Maestro registrada.
