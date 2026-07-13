# Activa Club

Activa Club es una plataforma web responsive para modernizar un club deportivo
privado que actualmente opera con un sistema on-premise. El proyecto demuestra
la migración de datos hacia AWS y habilita una experiencia digital para socios
y administradores: activación de cuenta, membresías, pagos, reservas,
notificaciones y dashboards.

La fuente única de verdad sobre alcance, reglas de negocio y stack acordado es
[`docs/product/contexto-maestro.md`](docs/product/contexto-maestro.md).
Cualquier trabajo de producto, arquitectura o implementación debe alinearse con
ese documento.

## Stack acordado

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Hook Form + Zod,
  TanStack Query.
- Backend: Node.js + TypeScript sobre AWS Lambda, Amazon API Gateway (REST).
- Autenticación: Amazon Cognito.
- Datos: Amazon DynamoDB, Amazon S3 (archivos y JSON de migración).
- Correos: Amazon SES.
- Pagos: Culqi (sandbox).
- Observabilidad: Amazon CloudWatch.
- Infraestructura como código: Terraform.
- CI/CD: GitHub Actions con OIDC hacia AWS.
- Pruebas: Vitest, React Testing Library, Playwright.
- Calidad: ESLint, Prettier, TypeScript estricto.

## Estructura del monorepo

```
apps/web              Frontend React
apps/api              Backend serverless y lógica de negocio
packages/shared-types Contratos y tipos compartidos
packages/validation    Esquemas de validación compartidos
packages/ui            Componentes de interfaz reutilizables (si se requieren)
infrastructure/terraform  Infraestructura AWS
docs/product           Visión y reglas de negocio
docs/scrum              Épicas, historias, sprints
docs/architecture       ADRs y decisiones técnicas
docs/api                Contratos de API
docs/data               Modelo de datos y migración
docs/security           Seguridad, roles y permisos
docs/testing            Estrategia y evidencias de pruebas
docs/deployment         Guía de entornos, CI/CD y despliegues
mock-data               JSON del sistema on-premise (mock)
```

Este es un monorepo administrado con **npm workspaces**. Cada app/paquete
tiene su propio `package.json` y extiende la configuración compartida de
TypeScript (`tsconfig.base.json`), ESLint (`eslint.config.js`) y Prettier
(`.prettierrc.json`) definidas en la raíz.

## Requisitos previos

- Node.js >= 20
- npm >= 10
- Git

## Setup

```bash
git clone <url-del-repositorio>
cd _Tesis-app
npm install
cp .env.example .env   # completar valores reales localmente, nunca commitear
```

## Scripts disponibles (raíz)

```bash
npm run lint           # ESLint en todo el monorepo
npm run lint:fix        # ESLint con autofix
npm run format          # Prettier --write en todo el monorepo
npm run format:check    # Prettier --check (usado en CI)
npm run typecheck       # tsc --noEmit en cada workspace que lo defina
npm run build            # build en cada workspace que lo defina
npm run test              # tests en cada workspace que lo defina
```

## Estado del proyecto

Este repositorio se encuentra en Sprint 0 (fundación técnica y documental).
Aún no existen aplicaciones funcionales, Lambdas ni infraestructura AWS
provisionada; la estructura actual es la base sobre la que se construirán las
historias de las épicas siguientes (ver `docs/scrum/`).

El pipeline de calidad de Pull Request ya está configurado (US-005): ver
[`docs/deployment/ci-pull-request.md`](docs/deployment/ci-pull-request.md) y
[`.github/workflows/pr-quality.yml`](.github/workflows/pr-quality.yml). La
gobernanza de Git (plantillas de PR, protección de ramas, CODEOWNERS) aún se
configura en una historia posterior (US-007).

## Convención de commits

Este proyecto usa obligatoriamente [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
para todos los commits, por ejemplo:

```
feat(api): agregar validación de DNI en activación de cuenta
fix(web): corregir cálculo de días restantes de membresía
docs(scrum): agregar historia US-011
chore(infra): configurar backend remoto de Terraform
```

Tipos habituales: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
`build`, `perf`. El scope debe reflejar el área afectada (`web`, `api`,
`shared-types`, `validation`, `ui`, `infra`, `scrum`, etc.). La automatización
de esta convención (por ejemplo, `commitlint` en CI) y el resto del gobierno
Git (plantillas de PR, protección de ramas, CODEOWNERS) se definen en US-007.

## Metodología

Toda funcionalidad parte de una historia de usuario aprobada con criterios de
aceptación verificables, con trazabilidad entre épica, historia, tarea, código,
pruebas y Pull Request. Ver `docs/product/contexto-maestro.md`, sección
"Metodología Scrum".
