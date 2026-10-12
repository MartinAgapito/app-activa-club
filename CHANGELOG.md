# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto usa [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
como convención obligatoria de commits (ver `CONTRIBUTING.md`). Cada entrada
de este changelog debe poder trazarse a una o más historias/tareas del
backlog en `docs/scrum/`.

## [Unreleased]

### Added

- Reservas del administrador en pestañas "Por aprobar" (con contador) y
  "Todas", con tabla (`DataTable`), filtros y pestaña guardados en la URL,
  panel lateral de detalle (`?reserva=<id>`) con participantes, y las
  decisiones aprobar, rechazar con motivo obligatorio y cancelar en ventanas
  con aviso efímero y errores (409, 404) dentro de la ventana (US-077,
  EP-08). Sin cambios en el servidor.
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
