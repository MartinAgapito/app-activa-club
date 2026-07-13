# apps/web

Frontend de Activa Club: React + TypeScript + Vite + Tailwind CSS.

Scaffolding real (Vite + estructura de carpetas + mapa de rutas + design
foundation) entregado por [US-008](../../docs/scrum/historias/US-008-mapa-rutas-design-foundation.md)
(Sprint 0). **No implementa flujos de negocio todavía** — Sprint 0 es
fundación técnica y documental (ver `docs/scrum/sprints/sprint-0.md`). Las
pantallas reales (activación por DNI, reservas, pagos, etc.) se implementan
en Sprint 1+ sobre historias de usuario aprobadas.

## Documentación de esta historia

- [Mapa de rutas](./docs/mapa-de-rutas.md): rutas públicas, de socio y de
  administrador, guards por rol, decisión de enrutamiento (React Router).
- [Design foundation](./docs/design-foundation.md): tokens de Tailwind
  (color, tipografía, espaciado), enfoque responsive, accesibilidad e
  infraestructura base de datos (TanStack Query, cliente HTTP).

## Stack

- React 19 + TypeScript + Vite.
- Tailwind CSS v4 (config CSS-first, ver `src/index.css` y `src/styles/theme.css`).
- React Router v7 (`createBrowserRouter`/`RouterProvider`).
- TanStack Query (infraestructura base, sin queries de negocio todavía).
- React Hook Form + Zod (`@hookform/resolvers`); formulario de referencia en
  `src/examples/`.
- Vitest + Testing Library para pruebas de componentes.
- Componentes fundamentales reutilizables en
  [`packages/ui`](../../packages/ui).
- Tipos y validaciones compartidas: [`packages/shared-types`](../../packages/shared-types),
  [`packages/validation`](../../packages/validation).

## Estructura

```
src/
  app/            Composición de providers (TanStack Query, auth placeholder)
  auth/           Contexto de sesión (placeholder; Cognito se integra en Sprint 1)
  components/     Componentes locales de apps/web (p. ej. UnderConstructionPage)
  examples/       Patrones de referencia (RHF+Zod, TanStack Query) — no son pantallas reales
  layouts/        PublicLayout, MemberLayout, AdminLayout
  lib/            Cliente HTTP base y configuración de TanStack Query
  pages/
    public/       Inicio, login, activación, registro, recuperar contraseña, verificar correo
    member/       Home, membresía, pagos, reservas, notificaciones, perfil
    admin/        Dashboard, socios, solicitudes, membresías, reservas, recursos, notificaciones, analytics
    shared/       404, 403, estado de solicitud pendiente
    dev/          Referencia interna de design system (solo modo desarrollo)
  routes/         Árbol de rutas (router.tsx) y guard de rol (guards/RequireRole.tsx)
  styles/         Tema de Tailwind (tokens de diseño)
```

## Scripts

```bash
npm run dev -w @activa-club/web
npm run build -w @activa-club/web
npm run lint -w @activa-club/web
npm run typecheck -w @activa-club/web
npm run test -w @activa-club/web
```

## Variables de entorno

Ver `.env.example` en la raíz del monorepo (`VITE_API_BASE_URL`,
`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`). Ninguna es un secreto:
las claves privadas de Cognito/Culqi nunca se exponen al frontend (RN-PAG-08).

No implementar lógica de negocio ni llamadas reales a la API fuera de una
historia de usuario aprobada (ver `docs/scrum/`) y los contratos de API/tipos
correspondientes en `docs/api/` y `packages/shared-types`.
