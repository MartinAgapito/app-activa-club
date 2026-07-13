<!--
Plantilla de Pull Request — Activa Club
Gobernada por US-007 (docs/scrum/historias/US-007-gobierno-git-plantillas-pr.md).
Completa todas las secciones aplicables. Elimina las que no apliquen solo si
justificas por qué no aplican (no las borres en silencio).
-->

## 1. Historia, tarea o bug relacionado

- Épica: `EP-NN` (ej. EP-01)
- Historia / tarea / bug: `US-NNN` (ej. US-007) — enlace al archivo en
  `docs/scrum/historias/` o `docs/scrum/` correspondiente.
- Criterios de aceptación cubiertos por este PR:
  1. ...
  2. ...

> Si este PR no está vinculado a una historia, tarea o bug del backlog,
> justifica explícitamente por qué (ej. hotfix urgente, ver sección de
> excepciones más abajo) antes de solicitar revisión.

## 2. Resumen funcional / técnico

Describe en 2-5 líneas qué cambia y por qué, en términos que una persona no
autora del cambio pueda entender sin leer el diff completo.

## 3. Archivos o áreas afectadas

Marca las áreas que este PR modifica:

- [ ] `apps/web` (frontend)
- [ ] `apps/api` (backend)
- [ ] `packages/shared-types` / `packages/validation` / `packages/ui`
- [ ] `infrastructure/terraform` (infraestructura)
- [ ] `.github/workflows` (CI/CD)
- [ ] `docs/architecture` / `docs/api` / `docs/data`
- [ ] `docs/scrum` / `docs/product`
- [ ] `docs/testing` / pruebas (unitarias, integración, E2E)
- [ ] `docs/security`
- [ ] `docs/deployment`
- [ ] Otro (especificar): ...

Si este PR toca más de una unidad lógica no relacionada, sepáralo en PRs
distintos antes de solicitar revisión (ver `CONTRIBUTING.md`).

## 4. Pruebas ejecutadas

Describe la evidencia de validación, no solo que "pasó CI". Incluye comandos
ejecutados localmente cuando aplique:

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test` (unitarias / integración)
- [ ] Pruebas E2E (Playwright), si aplica
- [ ] `npm run format:check`
- [ ] Verificación manual (describir pasos)

```
# Pega aquí salida relevante o resumen de resultados
```

## 5. Cambios de infraestructura (Terraform)

Completa solo si el PR incluye cambios en `infrastructure/terraform/**`.

- [ ] No aplica (este PR no toca Terraform).
- [ ] `terraform fmt -check` ejecutado.
- [ ] `terraform validate` ejecutado.
- [ ] `terraform plan` ejecutado y adjunto/pegado a continuación.
- [ ] Recursos con estado sensible o destructivo (`destroy`, `replace`) fueron
      revisados explícitamente.

```
# Pega aquí el resumen del plan de Terraform, si aplica
```

## 6. Riesgos y plan de rollback

- **Riesgo:** describe el impacto si algo sale mal (usuarios afectados,
  disponibilidad de datos, downtime, etc.). Si el riesgo es bajo, indícalo
  explícitamente.
- **Plan de rollback:** cómo revertir el cambio (revert de PR, redeploy de
  versión anterior, plan de Terraform inverso, feature flag, etc.).

## 7. Capturas de pantalla / evidencia visual

Adjunta capturas antes/después si el PR incluye cambios visuales en
`apps/web`. Si no aplica, indica "No aplica (sin cambios visuales)".

## 8. Checklist de seguridad

- [ ] No se incluyen secretos, credenciales, claves AWS, tokens de Culqi ni
      archivos `.env` reales.
- [ ] No se incluyen datos sensibles de socios (DNI reales, datos de pago,
      PII) fuera de `mock-data/` sanitizado.
- [ ] Los permisos/roles (IAM, Cognito, API Gateway) siguen el principio de
      mínimo privilegio, si aplica.
- [ ] Las reglas críticas de negocio se validan en el backend, no solo en el
      frontend, si aplica.

## Checklist de Definition of Done

- [ ] Los criterios de aceptación de la historia/tarea se cumplen y son
      verificables.
- [ ] La trazabilidad épica → historia → criterios → pruebas → PR está
      completa (sección 1).
- [ ] El código/entregable respeta el Contexto Maestro
      (`docs/product/contexto-maestro.md`) y no lo contradice.
- [ ] Pasa el CI de calidad: lint, formato, TypeScript estricto y pruebas
      (US-005).
- [ ] Los commits siguen Conventional Commits (ver `CONTRIBUTING.md`).
- [ ] La documentación afectada (producto, arquitectura, API, datos, testing)
      queda actualizada.
- [ ] No introduce funcionalidad de negocio fuera del alcance de la
      historia/tarea referenciada.

## Excepciones (hotfix urgente)

Completa solo si este PR es un hotfix urgente fuera del flujo normal
(ver `CONTRIBUTING.md`, sección "Flujo excepcional de hotfix").

- [ ] No aplica.
- [ ] Es un hotfix urgente. Justificación: ...
- [ ] Se documentará/actualizará la historia o bug correspondiente después del
      merge, referenciando este PR.
