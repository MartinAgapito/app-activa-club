# CI de calidad en Pull Request (US-005)

Este documento describe el workflow de GitHub Actions
[`.github/workflows/pr-quality.yml`](../../.github/workflows/pr-quality.yml),
que implementa el pipeline de **Pull Request** exigido por el rol
DevOps/Infraestructura.

## Disparadores

- `pull_request` hacia `main` y `master`.
- `push` directo a `main` y `master` (por ejemplo, tras un merge).
- `workflow_dispatch` para ejecución manual.

> Nota: la estrategia de ramas definitiva se fija en US-007 (gobierno Git,
> aún no ejecutada). Mientras tanto el workflow cubre ambos nombres de rama
> principal para no bloquear el trabajo. Cuando US-007 defina el nombre
> definitivo, ajustar la lista `branches` en el workflow (y, si aplica,
> retirar el nombre que no se use).

## Jobs

### 1. `quality` — Lint, typecheck, tests y build

Ejecuta sobre `ubuntu-latest` con Node.js fijado en [`.nvmrc`](../../.nvmrc)
(LTS activa, actualmente Node 24):

1. `actions/checkout@v4`
2. `actions/setup-node@v4` con `node-version-file: .nvmrc` y cache de npm.
3. `npm ci` — instala todo el monorepo (workspaces `apps/*`, `packages/*`).
4. `npm run lint` — ESLint (flat config raíz).
5. `npm run format:check` — Prettier `--check`.
6. `npm run typecheck` — `tsc --noEmit` en cada workspace que lo define
   (hoy: `packages/shared-types`, `packages/validation`, `packages/ui`).
7. `npm run test` — corre pruebas por workspace vía `--if-present`; como
   ningún workspace define aún `test`, el paso pasa en verde sin falsos
   positivos, tal como exige el criterio de aceptación de US-005. En cuanto
   un workspace agregue su propio script `test` (Vitest/Playwright, ver
   US-006), este paso lo ejecutará automáticamente sin cambios en el
   workflow.
8. `npm run build` — igual que `test`, no-op hasta que algún workspace
   defina `build`.

Cualquier fallo en estos pasos hace fallar el job y bloquea el merge (una
vez configurada la protección de rama en US-007).

### 2. `terraform` — fmt / validate / plan condicionales

`infrastructure/terraform/` hoy solo contiene un `README.md` (US-004 todavía
no se ejecuta). Este job está diseñado para **no romper el pipeline** por esa
ausencia y para activarse automáticamente cuando aparezcan archivos `.tf`
reales, sin necesidad de tocar el workflow:

1. Un paso de detección (`detect-tf`) busca archivos `*.tf` bajo
   `infrastructure/terraform/`. Si no encuentra ninguno, el resto de pasos
   de Terraform se omiten (`if:`) y el job termina en verde con un mensaje
   informativo.
2. Si hay archivos `.tf`:
   - `terraform fmt -check -recursive -diff`
   - `terraform init -backend=false` + `terraform validate` (no requiere
     credenciales AWS ni backend remoto configurado).
3. `terraform plan` solo se ejecuta si, además de haber archivos `.tf`,
   existe el secreto `AWS_OIDC_ROLE_ARN` en el repositorio/entorno. Cuando
   ese secreto exista:
   - Se configuran credenciales temporales vía
     `aws-actions/configure-aws-credentials@v4` (OIDC, sin claves estáticas).
   - Se corre `terraform init` (sin `-backend=false`), leyendo el bloque
     `backend "s3"` que debe definirse dentro del propio código Terraform de
     US-004 (el workflow no necesita conocer sus parámetros).
   - Se corre `terraform plan -input=false -no-color`.

**Activación automática al llegar US-004**: basta con (a) agregar el código
Terraform real con su bloque `backend "s3"`, y (b) configurar el secreto
`AWS_OIDC_ROLE_ARN` (rol IAM asumible vía OIDC de GitHub) y, opcionalmente,
la variable de repositorio `AWS_REGION`. No se requiere editar
`pr-quality.yml`.

Permisos del job: `contents: read`, `id-token: write` (este último es
imprescindible para que `configure-aws-credentials` pueda solicitar el token
OIDC; no tiene efecto mientras no se use).

### 3. `security` — Controles básicos de seguridad

1. **Escaneo de patrones de secretos conocidos**: `git grep` sobre los
   archivos versionados buscando patrones como AWS Access Key ID
   (`AKIA...`), bloques `-----BEGIN ... PRIVATE KEY-----`, tokens de GitHub
   (`ghp_`, `gho_`, etc.), API keys de Google (`AIza...`) y tokens de Slack
   (`xox...`). Si encuentra alguna coincidencia, el job falla y bloquea el
   merge. Se excluyen `.env.example`, `package-lock.json` y archivos
   Markdown (para evitar falsos positivos en ejemplos de documentación).
   - Es un control **básico** sobre el árbol de trabajo actual, no un
     escaneo de historial completo. Se documenta como mejora futura evaluar
     `gitleaks` o `truffleHog` (escaneo de historial de commits) sin que eso
     bloquee esta historia.
2. **Verificación de archivos `.env` versionados**: falla si se encuentra
   cualquier `.env*` real (que no sea `*.env.example`) trackeado por git.
3. **Auditoría de dependencias (`npm audit --audit-level=high`)**:
   `continue-on-error: true`. Política Sprint 0: informativa/no bloqueante,
   porque el árbol de dependencias hoy es mínimo (placeholders de
   workspaces). Revisar y endurecer esta política (por ejemplo, bloquear en
   `critical`) cuando existan dependencias de producción reales en
   `apps/web` y `apps/api`.

### 4. `ci-gate` — check agregador

Job final que depende de `quality`, `terraform` y `security` y falla si
alguno de ellos no fue exitoso. Pensado para usarse como único "status
check" requerido en la protección de la rama principal que definirá US-007,
sin perder la visibilidad individual de cada job en la UI de GitHub.

## Secrets y variables (todas opcionales hoy)

| Nombre              | Tipo             | Uso                                                                    | Estado actual                       |
| ------------------- | ---------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| `AWS_OIDC_ROLE_ARN` | Secret           | Rol IAM que asume GitHub Actions vía OIDC para `terraform plan`        | No configurado (US-004 en adelante) |
| `AWS_REGION`        | Variable de repo | Región AWS para `terraform plan` (default `us-east-1` si no se define) | No configurado                      |

No se usan ni se deben usar claves AWS estáticas (`AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`) en ningún paso de este workflow.

## Riesgos y consideraciones

- **Costo**: el pipeline corre en runners `ubuntu-latest` estándar de
  GitHub Actions (gratuitos para repos públicos / incluidos en el plan del
  repo privado). No aprovisiona ni destruye recursos AWS (no hay `apply`).
  `terraform plan` es de solo lectura sobre el estado remoto una vez que
  exista.
- **Seguridad**: mínimo privilegio por job (`permissions` explícitos);
  `id-token: write` solo en el job `terraform`. El escaneo de secretos es
  básico (no reemplaza gitleaks/truffleHog); no auditar el historial
  completo de commits.
- **Falsos negativos posibles** en el escaneo de patrones (no es exhaustivo).
  No commitear nunca secretos reales confiando únicamente en este control.
- **Hallazgo detectado durante la validación de esta historia (resuelto)**:
  al momento de escribir este documento, los archivos
  `packages/shared-types/src/*.ts` contenían una etiqueta literal
  `</content>` al final de cada archivo (artefacto de generación previo,
  fuera del alcance de US-005/DevOps). Esto habría hecho fallar
  `npm run lint`, `npm run format:check` y `npm run typecheck` en el job
  `quality` de este pipeline. El Arquitecto corrigió el contenido al
  completar US-003 (verificado: `tsc --noEmit` y ESLint limpios en
  `packages/shared-types` y `packages/validation`), por lo que ya no
  bloquea el pipeline.

## Cómo probarlo localmente

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

Para Terraform (cuando exista código real en `infrastructure/terraform/`):

```bash
cd infrastructure/terraform
terraform fmt -check -recursive -diff
terraform init -backend=false
terraform validate
```
