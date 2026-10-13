# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto usa [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
como convención obligatoria de commits (ver `CONTRIBUTING.md`). Cada entrada
de este changelog debe poder trazarse a una o más historias/tareas del
backlog en `docs/scrum/`.

## [Unreleased]

### Changed

- Pulido de textos y sesión del administrador: se quitan los códigos internos
  de reglas de negocio (RN-XXX) de los textos visibles; la sesión
  (`useAuth()`) expone `email` y `displayName` leídos del ID token, y el menú
  de usuario del administrador muestra el correo (respaldo "Administrador");
  `/verificar-correo` pasa de "en construcción" a una pantalla sobria que
  orienta a activar con DNI o registrarse. Sin cambios de API.
- Solicitudes de socios del administrador rehechas (US-078, EP-08):
  `/admin/solicitudes` usa `DataTable` (nombre, DNI, fecha, estado, "Cargar
  más"), panel lateral con el detalle en `?solicitud=<memberId>`, "Aprobar"
  (con la consecuencia: pagar la primera membresía) y "Rechazar" (motivo
  obligatorio) en ventana, avisos "Solicitud aprobada"/"Solicitud rechazada",
  conflicto 409 dentro de la ventana con acción "Actualizar" y la solicitud
  sale de la lista sin recargar. Sin cambios de API.

### Added

- Métricas de reservas y ocupación del administrador (US-058, EP-07):
  `GET /dashboard/admin` calcula `periods`, `reservationsByResource`,
  `reservationsByDay`, `reservationsByHour` y `occupancy` (con
  `reservedHours` y `operatingHours`) sobre los últimos 30 días de America/Lima,
  con `Query` por recurso en GSI3 y bloqueos de mantenimiento, sin `Scan`.
  Tipos de `shared-types` extendidos de forma aditiva.
- Infraestructura de dashboards en `dev` (US-054, EP-07): dos endpoints
  serverless (`GET /dashboard/member` para socios y `GET /dashboard/admin` para
  administradores) con Cognito, IAM de solo lectura (`GetItem` y `Query`) con
  cada índice como ARN explícito (GSI1 y GSI2 para el socio; GSI1, GSI2 y GSI3
  para el administrador), log group y sin alarma de errores (ADR-0008). La del
  administrador con tiempo máximo de 29 s y 512 MB. Ambas devuelven 501 hasta
  US-055, US-057 y US-058. Sin cambios de API ni de lógica de negocio.
- Avisos de renovación (US-047, EP-05): nuevo proceso diario
  `memberships-notify` (EventBridge 08:00 America/Lima, módulo
  `scheduled-job`, alarma de errores) que consume el rastro
  `MembershipTransition` de US-038 y emite `RENEWAL_DUE` (por vencer) y
  `RENEWAL_OVERDUE` (vencida) al socio, una vez por ciclo de vigencia. No avisa
  a socios sin cuenta digital ni a quien ya renovó; un fallo por socio no
  detiene al resto y el rastro queda pendiente para el día siguiente. Sin
  cambios de API ni nuevos índices.
- Recordatorio de reserva próxima (US-046, EP-05): nuevo proceso programado
  `reservations-remind` (EventBridge, 18:00 America/Lima = 23:00 UTC, módulo
  `scheduled-job`) que emite `RESERVATION_REMINDER` al titular de cada reserva
  `CONFIRMED`/`APPROVED` del día calendario siguiente. Recorre los diez
  recursos del catálogo con `GetItem` y consulta GSI3 por recurso y rango
  (patrón 21), sin `Scan`. Idempotente (`entityId = reservationId`): una doble
  ejecución o un reintento no duplica avisos. Un error por recurso o reserva no
  detiene el lote, queda en el log estructurado (`evaluated`, `sent`,
  `duplicated`, `errors`) y la invocación termina en error para disparar la
  alarma de Lambda Errors (ADR-0008). IAM mínimo: `GetItem`/`PutItem` sobre la
  tabla, `Query` solo sobre GSI3 y `ses:SendEmail`. Sin endpoints nuevos.
- Consola de notificaciones del administrador (US-049, EP-05):
  `/admin/notificaciones` con pestañas "Publicar" y "Enviadas" (`?tab=`).
  Publicar: título y mensaje con contador y validación de
  `createNotificationSchema`, destinatarios por segmento (un socio por DNI con
  su nombre confirmado, o titulares de reservas de una instalación), opción de
  correo con aviso del tope de 15 y de SES, confirmación con resumen y
  advertencia de que no se puede deshacer, resultado con aviso y resumen
  (destinatarios, correos enviados, fallidos y omitidos, repetición) y errores
  `NO_RECIPIENTS`, `RECIPIENT_LIMIT_EXCEEDED`, 404, 400, 403 y de red sin
  perder lo escrito. Enviadas: tabla con fecha en hora de Lima, origen Manual o
  Sistema y correo, "Cargar más" por cursor y panel de detalle. Sin cambios de
  API.
- Publicación de notificaciones segmentadas (US-048, EP-05): `POST /notifications`
  (admin) entrega un aviso a la bandeja de los socios de `ALL`, `ACTIVE`, `DEBT`,
  `EXPIRED`, `EXPIRING_SOON`, `SINGLE` o `BY_RESOURCE` (sin `Scan`: GSI2/GSI3 y
  `GetItem`), con un solo aviso por socio, auditoría `NOTIFICATION_SENT`,
  bandejas en bloques de 100 ítems y reintento idempotente (mismo id dentro de
  5 minutos). Segmento sin destinatarios: 422 `NO_RECIPIENTS`; más de 500
  destinatarios: 422 `RECIPIENT_LIMIT_EXCEEDED`. Con `alsoEmail=true` el correo
  es best-effort con tope de 15 por publicación, ritmo de 1/s y presupuesto de
  22 s; la respuesta informa `emailsSent`, `emailsFailed` y `emailsSkipped`.
  `GET /notifications/sent` (admin) lista el historial paginado por cursor con
  `origin` `MANUAL`/`SYSTEM`. Sin cambios de Terraform.
- Avisos del resultado de un pago (US-043, EP-05): `POST /payments` y el
  webhook `POST /payments/webhook` emiten `PAYMENT_SUCCEEDED` (plan, monto y
  nueva vigencia) o `PAYMENT_FAILED` (motivo del catálogo propio) al socio
  titular, con `entityId = paymentId`, solo en la primera transición del pago a
  su estado final: un webhook repetido, un pago ya confirmado por el cobro
  síncrono o un `PAYMENT_DUPLICATE` no generan un segundo aviso, y un pago en
  `PENDING_CONFIRMATION` no avisa hasta que el webhook lo resuelve. Un fallo
  de bandeja o de SES nunca cambia la respuesta HTTP ni el estado del pago. Sin
  cambios de contrato ni de infraestructura.

- Aviso de mantenimiento a los socios afectados (US-045, EP-05):
  `POST /resources/{resourceId}/maintenance` y `PATCH /resources/{resourceId}`
  (al pasar a `MAINTENANCE`) emiten `RESOURCE_MAINTENANCE` al titular de cada
  reserva activa afectada (una por reserva, con su franja en hora de Lima y
  la indicación de que no se canceló automáticamente). Reutiliza la lectura de
  ocupación ya hecha, resuelve titulares con un `GetItem` por socio y emite en
  paralelo acotado (máx. 100 avisos, 10 en paralelo, 6 s por petición; el
  exceso se omite con la métrica `MAINTENANCE_NOTIFY_TRUNCATED`). Idempotente
  y best-effort: un fallo de bandeja o correo no cambia la respuesta ni el
  bloqueo. Sin cambios de contrato ni de IAM.

- Avisos de cambio de estado de una reserva (US-044, EP-05): al crear una
  reserva con confirmación automática (`RESERVATION_CONFIRMED`) y al aprobarla,
  rechazarla (con el motivo) o cancelarla (`RESERVATION_CANCELLED`, indicando si
  la canceló el club o el propio socio), el titular recibe un aviso en su
  bandeja y un correo best-effort. No se avisa a participantes ni al crear una
  reserva `PENDING_APPROVAL`; un fallo del aviso nunca cambia la respuesta de
  la operación. Idempotente por reserva y evento. Sin cambios de API ni de IAM.

- Avisos de cuenta y de solicitud (US-042, EP-05): `POST /activation/complete`,
  `POST /members/{memberId}/approve` y `POST /members/{memberId}/reject`
  emiten `ACCOUNT_ACTIVATED`, `MEMBER_APPROVED` y `MEMBER_REJECTED` (con el
  motivo) al socio afectado una vez confirmada la operación, a través de
  `safeEmitNotification` (nuevo envoltorio defensivo en `notifications/`): un
  fallo del aviso jamás cambia la respuesta HTTP. Sin cambios de contrato ni de
  infraestructura.
- Bandeja de notificaciones del socio en `/socio/notificaciones` (US-041,
  EP-05): tabla con fecha en hora de Lima y estado Leída/No leída en texto,
  pestañas Todas / No leídas (`?tab=`), "Cargar más", panel lateral con el
  detalle y acceso a Mis reservas o Membresía según el evento. Abrir una
  notificación la marca como leída de forma optimista (con rollback y aviso
  solo si falla). Sin contador de no leídas en el menú.

- Bandeja de notificaciones del socio, parte backend (US-041, EP-05):
  `GET /notifications` (más reciente primero, paginado por cursor, filtro
  `unread=true`) y `POST /notifications/{notificationId}/read` (idempotente;
  404 si no es del socio). Reemplaza el placeholder 501 de ambas Lambdas en
  `scripts/package-lambdas.mjs`. Sin cambios de infraestructura.
- Motor de notificaciones del backend (US-040, EP-05): módulo
  `apps/api/src/notifications/` con `emitNotification()`, que escribe en una
  transacción idempotente la `Notification` (`createdBy=SYSTEM`) y la
  `MemberNotification` del socio y envía el correo por SES de forma
  best-effort (un fallo de SES nunca revierte la bandeja ni la operación de
  negocio), más el catálogo de textos en español de los 13 `NotificationEvent`
  con escape de HTML. El correo se arma en código (SES v2 `SendEmail` simple,
  solo `ses:SendEmail`), sin plantillas SES en Terraform. Atributo
  `dedupeKey` documentado en `Notification`. Aún no lo invoca ningún handler
  (US-042..US-047). Dependencia nueva: `@aws-sdk/client-sesv2@3.1141.0`.

- Infraestructura de notificaciones en `dev` (US-039, EP-05): cuatro endpoints
  serverless (`GET /notifications` y `POST /notifications/{notificationId}/read`
  para socios; `POST /notifications` y `GET /notifications/sent` para
  administradores) con Cognito, IAM de mínimo privilegio por índice, log group y
  sin alarma de errores (ADR-0008). Las 4 Lambdas devuelven 501 hasta US-041,
  US-048 y US-049. Las 11 Lambdas que emiten eventos reciben `ses:SendEmail`
  acotado a la identidad remitente y la variable `SES_SENDER_EMAIL`;
  `resources-update` recibe además `Query` sobre GSI3. Sin cambios de API ni
  de lógica de negocio.

- Guarda de CI `check:handlers` (`scripts/check-handler-mapping.mjs`): falla
  si un handler real de `apps/api` no está en el mapa `HANDLERS` de
  `scripts/package-lambdas.mjs`, si una entrada apunta a un archivo
  inexistente o si usa `not-implemented.ts` sin `// PLACEHOLDER(US-NNN)`.
  Integrada en el job `lint` de `pr-quality.yml`; sus pruebas corren con
  `npm run test:scripts` en el job `test`. Evita repetir el incidente de
  endpoints de reservas desplegados con el placeholder 501 (PR #95).

- Pantalla `/admin/membresias` como "Pagos" (US-053, EP-06): planes vigentes
  con su precio y consulta de pagos de los socios con tabla (fecha en hora de
  Lima, socio, plan, monto y estado), filtros por estado (por defecto
  "Rechazados y en verificación") y por socio mediante DNI exacto, "Cargar
  más" y panel lateral de detalle (`?pago=`) sin datos de tarjeta. Nunca
  consulta sin filtro, como exige el servidor. Admite `?socio=<memberId>` para
  llegar ya filtrada. Sin cambios en la API.
- Historial de pagos del socio en `/socio/pagos` (US-050, EP-03, sobre US-025):
  "Mis pagos" con tabla (tarjetas en móvil) de fecha en hora de Lima, concepto,
  monto en soles y estado en español (Pagado, En verificación, Rechazado),
  resumen del último pago, "Cargar más" por cursor, panel lateral con el detalle
  (monto, plan, estado, fechas y referencia interna; sin datos de tarjeta ni
  identificadores de Stripe), estado vacío con enlace a membresía y errores con
  Reintentar. Un cursor inválido (400) vuelve a la primera página. Sin cambios
  en el servidor.
- Consulta de socios del administrador (US-051, EP-06, EP-08): `/admin/socios`
  deja de ser un placeholder y muestra el padrón en pestañas por estado de
  cuenta (Activos, Migrados, Aprobados, Pendientes, Rechazados; `?tab=`) con
  tabla (nombre, DNI, origen, estado de membresía, fecha de alta) y "Cargar
  más", búsqueda por DNI exacto (8 dígitos) y panel lateral de solo lectura
  (`?socio=<memberId>`) con contacto, cuenta, membresía, vencimiento, días
  restantes, saldo y renovación automática. Sin cambios de API.

- Reservas del administrador en pestañas "Por aprobar" (con contador) y
  "Todas", con tabla (`DataTable`), filtros y pestaña guardados en la URL,
  panel lateral de detalle (`?reserva=<id>`) con participantes, y las
  decisiones aprobar, rechazar con motivo obligatorio y cancelar en ventanas
  con aviso efímero y errores (409, 404) dentro de la ventana (US-077,
  EP-08). Sin cambios en el servidor.
- Pantalla `/admin/recursos` con pestañas "Instalaciones" y "Mantenimiento"
  (US-075 y US-076, EP-08), con la pestaña activa en `?tab=` y la instalación
  elegida en `?recurso=`. Instalaciones: tabla con aforo, horario, duración
  del bloque, aprobación y estado con etiqueta; "Editar" abre una ventana con
  aforo, apertura, cierre y estado (datos fijos como solo lectura), validación
  en línea, "Guardar" deshabilitado sin cambios, confirmación antes → después
  al cambiar aforo, horario o pasar a mantenimiento, confirmación al cerrar
  con cambios sin guardar, errores del servidor dentro de la ventana y aviso
  efímero "Instalación actualizada". Mantenimiento: tabla de bloqueos por
  instalación ordenada por inicio, "Nuevo bloqueo" en una ventana (valida fin
  posterior al inicio e inicio no pasado), aviso persistente "N reservas
  quedan dentro del bloqueo" con "Ver reservas" y "Liberar" con confirmación
  y aviso "Bloqueo liberado". `?nuevo=1` abre la ventana de nuevo bloqueo.
  Sin cambios en la API.
- Mis reservas rehecha (US-074, EP-08): pestañas "Próximas" y "Pasadas" con
  contador y estado en la URL (`?tab=`), tabla responsive con "Cargar más",
  panel lateral de detalle con dirección propia (`?reserva=`) con
  participantes, motivo de rechazo y fecha de cancelación, y cancelación en
  ventana con la consecuencia explícita, aviso "Reserva cancelada" y errores
  del servidor dentro de la ventana. "Cancelar reserva" queda deshabilitado
  con el motivo visible cuando faltan menos de 24 horas. Sin cambios de API.
- Inicio del administrador (US-071, EP-08): `/admin` pasa de placeholder a
  panel orientado a la acción con bloques independientes ("Requiere tu
  atención", "Reservas por aprobar" con `DataTable` de las 5 más próximas y
  accesos rápidos), cada uno con estados de carga, error con reintento y
  "Todo al día". Usa solo `GET /members?status=PENDING` y
  `GET /reservations?scope=all&status=PENDING_APPROVAL`; al ser listados
  paginados sin total, muestra "N o más" cuando hay más páginas. US-059 solo
  reemplazará la fuente en `admin/dashboard/pending-summaries.ts`.
- Inicio del socio (US-070, EP-08): saludo con fecha de Lima, "pase" de
  membresía con CTA contextual, aviso si no puede reservar, accesos rápidos
  (Reservar deshabilitado con motivo), próximas reservas (máx. 3) y estados
  de carga/error/vacío independientes por bloque. Solo consume
  `GET /members/me`, `GET /reservations?scope=me&from=` y `GET /payments?limit=1`.
- Estructura de aplicación por rol (US-068, EP-08): barra lateral de 232 px
  con iconos (`lucide-react`) y elemento activo con `aria-current`, cabecera
  con título de sección y menú de usuario ("Mi perfil", "Cerrar sesión"),
  menú móvil en `Drawer` izquierdo por debajo de 760 px y enlace "Saltar al
  contenido" en los layouts de socio, administrador y público. `PageLayout`
  acepta `mainId`.
- Componente `Drawer` (panel lateral) en `@activa-club/ui`, sobre Radix
  Dialog: borde derecho o izquierdo, título obligatorio, cuerpo con scroll y
  pie fijo, foco atrapado y devuelto, animación que respeta
  `prefers-reduced-motion` (US-063, EP-08). `ToastProvider` montado en la raíz
  de `apps/web` y aviso elevado para no tapar los botones de un diálogo.
- Componente `Stepper` (indicador de pasos) en `@activa-club/ui`: lista
  ordenada con `aria-current="step"`, estados completado/actual/pendiente sin
  depender del color, completados clicables opcionalmente y forma compacta
  en pantallas pequeñas (US-067, EP-08).
- Fundación técnica y documental inicial (Sprint 0): estructura de monorepo
  con npm workspaces, estándares de calidad (TypeScript, ESLint, Prettier),
  documentación de producto y Scrum, y gobierno Git (Conventional Commits,
  estrategia de ramas, plantilla de Pull Request, CODEOWNERS). Ver
  `docs/scrum/sprints/sprint-0.md` para el detalle de historias en curso.
- Sprint 1 (EP-02): migración on-premise → DynamoDB, activación por DNI,
  registro de socio nuevo, login con Cognito, aprobación/rechazo de socios y
  perfil.
- Sprint 2 (EP-03): planes de membresía, cobro idempotente, checkout,
  renovación automática, webhook de confirmación e historial de pagos; pasarela
  migrada a Stripe test mode (ADR-0011).
- Sprint 3 (EP-04): catálogo de instalaciones, disponibilidad por día, creación de
  reserva con candado de concurrencia, participantes (socios e invitados),
  consulta y cancelación, aprobación o rechazo admin, mantenimiento de recursos,
  edición de aforo, horario y estado, y las pantallas de reserva, Mis reservas y
  administración. Pendiente: verificación extremo a extremo en `dev`.
- Sprint 4 (EP-03, US-038): proceso diario que actualiza el estado de la
  membresía por vencimiento (`EXPIRING_SOON` a 7 días o menos, `EXPIRED` al
  pasar la fecha), regla de vigencia única compartida, defensa por fecha en
  `POST /reservations` y módulo Terraform `scheduled-job` (EventBridge 00:15
  America/Lima, alarma de errores). Pendiente: verificación en `dev`.
- Sprint 4B (EP-08, US-061): tokens semánticos de diseño en
  `apps/web/src/styles/theme.css` (superficie, texto, borde, acción, estados,
  radios, elevación, capas, movimiento y escala tipográfica nombrada), fuentes
  Barlow Semi Condensed y Hanken Grotesk autoalojadas, muestra en
  `/_dev/design-system`, script de verificación de contraste AA y
  `design-foundation.md` v2.0. Modo oscuro preparado en estructura, no activo.
- Sprint 4B (EP-08, US-062): componente `Modal` accesible en `@activa-club/ui`
  sobre `@radix-ui/react-dialog` (foco atrapado y devuelto, Escape, clic fuera
  configurable, identificadores únicos, scroll interno, pantalla completa en
  móvil); `ConfirmDialog` reconstruido sobre él sin cambiar su API. Ver
  ADR-0013.
- Sprint 4B (EP-08, US-064): componente `Tabs` (`Tabs`, `TabsList`,
  `TabsTrigger`, `TabsContent`) en `@activa-club/ui`, sobre
  `@radix-ui/react-tabs` (ADR-0013, en US-062): patrón WAI-ARIA, modo
  controlado para guardar la pestaña en la URL, contador por pestaña, scroll
  horizontal propio y pestañas deshabilitadas.
- Sprint 4B (EP-08, US-066): `ToastProvider` y `useToast()` en `packages/ui`
  (avisos efímeros accesibles: 5 s, error persistente, pausa al hover/foco,
  máximo 3, regiones ARIA live) y muestra en `/_dev/design-system`. Aún no
  montado en la raíz de la app.
- Sprint 4B (EP-08, US-065): componente `DataTable` en `@activa-club/ui`, tabla
  responsive (tarjetas bajo 640 px), fila accionable por teclado, columna de
  acciones, estados de carga, error y vacío, y pie "Cargar más" por cursor.

### Changed

- Carga inicial de socios: deja de ser el endpoint `POST /admin/migration/run` y
  pasa a ser la Lambda `migration-run` de invocación directa (consola o
  `aws lambda invoke`, sin API Gateway ni payload; autorización IAM, auditoría
  con actor `system`). Ver ADR-0012. El endpoint viejo queda en 501 hasta la
  fase 2 del despliegue, que lo elimina.
- `Button`, `Card`, `Badge`, `Input`, `Textarea` y `PageLayout` de
  `packages/ui` usan los tokens semánticos nuevos (US-061) sin cambiar su API.
  Botón principal pasa a `brand-600`; botón `positive` a `positive-700` y hover
  de `warning` a `warning-400` por contraste AA.

<!--
Convenciones para nuevas entradas:

- Agregar cambios bajo `[Unreleased]` en la subsección correspondiente
  (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
- Al cortar una versión, mover el contenido de `[Unreleased]` a una nueva
  sección `## [x.y.z] - AAAA-MM-DD` y dejar `[Unreleased]` vacío arriba.
- Referenciar la historia/tarea del backlog (US-NNN) en cada línea cuando
  aplique, por ejemplo:
  "- Validar activación de socio migrado por DNI (US-011)."
-->
