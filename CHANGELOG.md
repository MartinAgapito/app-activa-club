# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
este proyecto usa [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
como convención obligatoria de commits (ver `CONTRIBUTING.md`). Cada entrada
de este changelog debe poder trazarse a una o más historias/tareas del
backlog en `docs/scrum/`.

## [Unreleased]

### Added

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
