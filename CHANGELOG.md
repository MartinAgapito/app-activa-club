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
- Sprint 3 (EP-04, en curso): catálogo de instalaciones, disponibilidad por
  día, creación de reserva con candado de concurrencia, participantes
  (socios e invitados), consulta/cancelación y aprobación/rechazo admin.
  Pendientes: pantalla de reserva (US-032), mantenimiento (US-035) y gestión
  admin (US-036).

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
