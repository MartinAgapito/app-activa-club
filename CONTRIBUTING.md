# Contribuir a Activa Club

Este documento define el gobierno Git del proyecto: estrategia de ramas,
flujo de Pull Request y convención de commits. Es el entregable de
[US-007](docs/scrum/historias/US-007-gobierno-git-plantillas-pr.md) y
formaliza lo esbozado a alto nivel en el `README.md` raíz, sin contradecirlo.

Toda contribución debe partir de una historia de usuario, tarea técnica o bug
del backlog (`docs/scrum/`), salvo el flujo excepcional de hotfix descrito más
abajo. Ver `docs/product/contexto-maestro.md`, sección "Metodología Scrum",
para la trazabilidad completa épica → historia → criterios → pruebas → PR.

## Estrategia de ramas

- **Rama principal:** `main` (o `master`, según la convención vigente del
  repositorio remoto). Es la rama protegida; representa siempre el estado
  desplegable/revisable del proyecto.
- **Ramas de trabajo:** ramas de feature de vida corta, una por
  historia/tarea/bug, creadas desde la rama principal actualizada.

### Convención de nombres de rama

```
<tipo>/US-NNN-descripcion-corta
```

- `<tipo>` es uno de: `feat`, `fix`, `test`, `infra`, `ci`, `docs`, `refactor`,
  `chore` (los mismos tipos de Conventional Commits, ver más abajo).
- `US-NNN` es el identificador de la historia o tarea del backlog
  (`docs/scrum/historias/`). Para bugs sin historia formal, usar `BUG-NNN` o
  el identificador de issue equivalente.
- `descripcion-corta` es un resumen en minúsculas, separado por guiones, sin
  acentos.

Ejemplos:

```
feat/US-007-gobierno-git-plantillas-pr
fix/US-014-membresia-vencida-reservas
infra/US-004-dynamodb-tabla-socios
docs/US-002-adr-autenticacion-cognito
```

### Ramas de vida corta

- Se crean cuando arranca el trabajo de la historia/tarea y se eliminan tras
  el merge del Pull Request.
- Deben mantenerse actualizadas con la rama principal (rebase o merge desde
  `main`) para minimizar conflictos antes de solicitar revisión.
- No se comparten entre historias distintas: una rama = una unidad lógica de
  trabajo.

### Flujo excepcional de hotfix

Para correcciones urgentes en producción que no pueden esperar el ciclo
normal de historia:

1. Crear la rama `fix/HOTFIX-descripcion-corta` desde la rama principal.
2. Aplicar el cambio mínimo estrictamente necesario para resolver el
   incidente (nunca aprovechar para incluir funcionalidad adicional).
3. Abrir el Pull Request igualmente con la plantilla completa, marcando la
   sección de "Excepciones (hotfix urgente)" y justificando la urgencia.
4. El PR de hotfix sigue requiriendo revisión y CI en verde antes de mergear,
   salvo incidente crítico en producción explícitamente autorizado por el
   equipo, en cuyo caso la revisión se hace inmediatamente después del merge.
5. Después del hotfix, se crea o actualiza la historia/bug correspondiente en
   `docs/scrum/` referenciando el PR, para mantener la trazabilidad.

## Flujo de Pull Request

1. Crear la rama de trabajo desde la rama principal actualizada, siguiendo la
   convención de nombres anterior.
2. Realizar commits atómicos siguiendo Conventional Commits (ver siguiente
   sección).
3. Antes de abrir el PR, ejecutar localmente y confirmar que pasan:
   - `npm run lint`
   - `npm run format:check`
   - `npm run typecheck`
   - `npm run test`
   - `terraform fmt -check`, `terraform validate` y `terraform plan` cuando el
     cambio toque `infrastructure/terraform/**`.
4. Abrir el Pull Request contra la rama principal usando
   `.github/PULL_REQUEST_TEMPLATE.md` completo: historia/tarea/bug
   relacionado, resumen, archivos/áreas afectadas, pruebas ejecutadas,
   cambios de Terraform (si aplica), riesgos y rollback, capturas (si
   aplica) y checklist de seguridad.
5. El pipeline de CI de calidad (US-005, definido en
   `.github/workflows/`) debe pasar en verde antes de solicitar merge. Un PR
   con CI en rojo no se mergea, salvo excepción de hotfix explícitamente
   autorizada y justificada en el propio PR.
6. La revisión la realiza el owner/rol correspondiente según
   `.github/CODEOWNERS`, de acuerdo al área afectada (frontend, backend,
   infraestructura/DevOps, arquitectura, datos, producto/Scrum, QA, o el
   Context Guardian para `docs/product/contexto-maestro.md`). Cambios que
   crucen varias áreas requieren aprobación de cada rol involucrado.
7. Una vez aprobado y con CI en verde, se integra mediante **squash merge**
   hacia la rama principal, para mantener un historial lineal y legible por
   historia/tarea. El mensaje del commit resultante del squash debe seguir
   Conventional Commits y resumir la unidad lógica completa del PR (no una
   concatenación de los mensajes intermedios).
8. Tras el merge, se elimina la rama de trabajo.

### Cambios mixtos

Si un mismo diff mezcla trabajo de historias, tipos o áreas no relacionadas
(por ejemplo, un ajuste de Terraform junto con un fix de frontend), debe
separarse en Pull Requests distintos, cada uno con su propio commit atómico y
su propia plantilla completa, antes de solicitar revisión.

## Convención de commits (Conventional Commits)

Este proyecto usa obligatoriamente [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
para todos los commits, tal como lo introduce el `README.md` raíz. Formato:

```
<tipo>(<scope>): <descripción breve en modo imperativo, minúsculas, sin punto final>

[cuerpo opcional explicando el "por qué"]

[pie opcional: referencias a historias, breaking changes, etc.]
```

### Tipos permitidos y su scope habitual

| Tipo       | Uso                                                                                                               | Scopes habituales                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `feat`     | Nueva funcionalidad de negocio                                                                                    | `frontend`, `backend`, `auth`, `reservations`, o el área específica afectada |
| `fix`      | Corrección de errores                                                                                             | `api`, `web`, `auth`, `reservations`                                         |
| `test`     | Pruebas nuevas o corregidas (sin cambiar comportamiento de producción)                                            | `reservations`, `api`, `web`, o el módulo bajo prueba                        |
| `infra`    | Cambios de infraestructura como código                                                                            | `terraform`                                                                  |
| `ci`       | Cambios en pipelines/automatización de CI                                                                         | `github-actions`                                                             |
| `docs`     | Documentación (producto, arquitectura, Scrum, README, etc.)                                                       | `architecture`, `scrum`, o el área documentada                               |
| `refactor` | Reestructuración de código sin cambiar comportamiento observable                                                  | `web`, `backend`, o el área afectada                                         |
| `chore`    | Tareas de mantenimiento que no encajan en los tipos anteriores (dependencias, configuración de tooling, limpieza) | `repo`, o el área afectada                                                   |

> Nota: el `README.md` raíz también menciona `build` y `perf` como tipos
> habituales de Conventional Commits en general. Este proyecto no los declara
> como tipos de uso frecuente por ahora; si surge la necesidad, se agregan
> aquí explícitamente antes de usarse, para no fragmentar la convención.

El scope siempre debe reflejar el área real afectada, incluso si no aparece
en la tabla anterior (por ejemplo, `shared-types`, `validation`, `ui`,
`security`, `deployment`, `data`). La tabla lista los scopes más frecuentes
según los roles y carpetas del monorepo, no una lista cerrada.

### Ejemplos

```
feat(auth): validar activación de socio migrado por dni
feat(reservations): bloquear reservas con membresía vencida
fix(api): corregir cálculo de días restantes de membresía
test(reservations): cubrir cruces de horarios en reservas
infra(terraform): crear tabla dynamodb para socios
ci(github-actions): agregar job de typecheck al pipeline de pr
docs(scrum): agregar historias del sprint 0
docs(architecture): registrar adr de autenticación con cognito
refactor(web): extraer hook de cálculo de vigencia de membresía
chore(repo): actualizar dependencias de eslint
```

### Reglas de commit

- Un commit representa una única unidad lógica; no mezclar funcionalidades ni
  tipos no relacionados en el mismo commit.
- No commitear si fallan las pruebas o validaciones obligatorias para el
  alcance del cambio (lint, typecheck, tests, y `terraform validate`/`plan`
  cuando aplique).
- Nunca incluir secretos, archivos `.env` reales, claves de AWS, tokens de
  Culqi ni credenciales en ningún commit.
- Todo commit y Pull Request debe poder asociarse a una historia, tarea o bug
  del backlog (`docs/scrum/`), salvo el flujo excepcional de hotfix.

## Protección de la rama principal

- La rama principal (`main`/`master`) está protegida: no se permite push
  directo; todo cambio entra vía Pull Request.
- Checks de CI obligatorios (definidos en US-005, `.github/workflows/`) deben
  pasar en verde antes de habilitar el merge: lint, formato, typecheck y
  pruebas del monorepo.
- Se requiere al menos una revisión aprobada por el owner/rol correspondiente
  según `.github/CODEOWNERS` antes de mergear.
- El método de integración es **squash merge** (ver "Flujo de Pull Request").
- No se permite reescribir el historial de la rama principal (`push --force`,
  `rebase` sobre `main` compartido) sin autorización explícita.

## Relación con otros documentos

- `.github/PULL_REQUEST_TEMPLATE.md`: plantilla obligatoria de Pull Request.
- `.github/CODEOWNERS`: mapeo de carpetas del monorepo a roles/dueños
  conceptuales, usado para asignar revisión.
- `CHANGELOG.md`: registro de cambios notables por versión (Keep a
  Changelog), mantenido junto con los merges relevantes.
- `docs/scrum/definition-of-done.md`: criterios que todo cambio debe cumplir,
  incluyendo Conventional Commits y Pull Request revisado (puntos 7 y 8).
