# Design foundation — Activa Club (Frontend)

> Entregable de [US-008](../../../docs/scrum/historias/US-008-mapa-rutas-design-foundation.md)
> (Sprint 0, fundación). Sin lógica de negocio: tokens y componentes visuales
> únicamente. Audiencia: deportistas adultos 25-52 años. Dirección visual:
> moderna, activa, confiable y social — sin apariencia infantil ni agresiva.

## 1. Stack visual

- **Tailwind CSS v4** (config CSS-first vía `@theme`, sin `tailwind.config.js`
  — ver `apps/web/src/index.css` y `apps/web/src/styles/theme.css`).
- Plugin oficial `@tailwindcss/vite` (sin PostCSS/Autoprefixer adicionales:
  Tailwind v4 resuelve vendor-prefixing internamente).
- Componentes fundamentales en `packages/ui` (`@activa-club/ui`), consumidos
  tanto por `apps/web/src` como por el propio Tailwind vía la directiva
  `@source '../../../packages/ui/src'` en `index.css`, para que las clases de
  utilidad usadas dentro de `packages/ui` también se generen.

## 2. Tokens de color

Definidos como variables de tema (`--color-*`) en
`apps/web/src/styles/theme.css`, generan automáticamente las utilidades
`bg-*`, `text-*`, `border-*`, `ring-*` de Tailwind (p. ej. `bg-brand-700`,
`text-danger-600`).

| Escala     | Uso previsto                                                         | Tono base (500/600)   |
| ---------- | -------------------------------------------------------------------- | --------------------- |
| `brand`    | Azul profundo institucional: marca, navegación, acciones primarias   | `#34549f` / `#243d7a` |
| `positive` | Verde/turquesa: confirmaciones, pagos exitosos, estado activo/al día | `#17a88c` / `#0f8a72` |
| `warning`  | Ámbar: alertas, vencimientos próximos, estados pendientes            | `#f0980f` / `#cc7a08` |
| `danger`   | Rojo sobrio: errores, deuda, restricciones (nunca estridente)        | `#a93a36` / `#8c2e2b` |

Cada escala tiene 10 pasos (`50`...`900`), del más claro (fondos de badges,
`bg-brand-50`) al más oscuro (texto de alto contraste, `text-brand-900`). Los
neutrales (grises) usan la paleta `slate` por defecto de Tailwind — no se
redefinen.

**Mapeo semántico sugerido para Sprint 1** (a implementar junto con cada
pantalla, no en Sprint 0):

| Estado de dominio                                                         | Variante de `Badge`/`Button` |
| ------------------------------------------------------------------------- | ---------------------------- |
| Membresía `ACTIVE`, pago `SUCCEEDED`, reserva `CONFIRMED`/`APPROVED`      | `positive`                   |
| Membresía `EXPIRING_SOON`, socio `PENDING`, reserva `PENDING_APPROVAL`    | `warning`                    |
| Membresía `DEBT`/`EXPIRED`, pago `FAILED`, reserva `REJECTED`/`CANCELLED` | `danger`                     |
| Socio `MIGRATED`/`APPROVED`, estados neutros                              | `neutral` / `info`           |

## 3. Tipografía

- `--font-sans`: `'Inter', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`.
- Se prioriza `Inter` (moderna, alta legibilidad en pantallas móviles) con
  fallback a fuentes del sistema. **Decisión de Sprint 0**: no se carga desde
  un CDN externo (evita una dependencia de red y de CSP en esta fase de
  fundación); el auto-hosting de la fuente (`@fontsource/inter` o archivos
  locales) queda como tarea de Sprint 1 si se prioriza.
- Escala tipográfica: se usa la escala por defecto de Tailwind (`text-sm`,
  `text-base`, `text-xl`, `text-2xl`, etc.), sin tokens adicionales — es
  suficiente para el MVP y evita sobre-ingeniería.

## 4. Espaciado y layout

- Escala de espaciado por defecto de Tailwind (múltiplos de `0.25rem`), sin
  redefinir.
- Utilidad semántica `container-page` (definida con `@utility` en
  `theme.css`): centra el contenido, ancho máximo `72rem` y gutters
  progresivos (`1rem` móvil → `1.5rem` `sm` → `2rem` `lg`). La usan las
  barras de navegación de los layouts (`PublicLayout`, `MemberLayout`,
  `AdminLayout`).
- `PageLayout`/`PageHeader` (`packages/ui`) encapsulan la estructura de
  página: encabezado fijo, contenido con ancho máximo `max-w-6xl` y gutters
  responsive, pie opcional.

## 5. Enfoque responsive (mobile-first)

- Todas las utilidades y componentes se escriben mobile-first: estilos base
  para viewport angosto, con variantes `sm:`/`lg:` para ensanchar.
- Navegación de socio/administrador: fila horizontal con scroll en móvil
  (`overflow-x-auto`), columna fija en escritorio (`lg:flex-col`).
- Formularios de referencia (`ReferenceForm`) usan controles de altura
  cómoda para touch (`h-11`/`h-12`) y una sola columna en móvil.

## 6. Accesibilidad

- `Input`: asociación `label`/`input` vía `htmlFor`/`id` (con `useId` si no
  se provee `id`), `aria-invalid` y `aria-describedby` hacia el mensaje de
  error o de ayuda; el mensaje de error usa `role="alert"`.
- `Button`: estado `isLoading` marca `aria-busy` y deshabilita el control;
  foco visible vía `focus-visible:ring-*` en todos los componentes
  interactivos (además de un `outline` global en `:focus-visible`, ver
  `index.css`).
- `EmptyState`/`ErrorState`: `ErrorState` usa `role="alert"` para que los
  lectores de pantalla anuncien el fallo.
- Navegación por teclado: los layouts usan elementos nativos (`nav`,
  `button`, `a` vía `Link`/`NavLink`) en vez de `div` con manejadores de
  click, para heredar comportamiento de teclado correcto.
- **Pendiente conocido**: no se incorporó `eslint-plugin-jsx-a11y` en esta
  historia porque su versión publicada aún no declara soporte oficial para
  ESLint 10 (peer dependency tope en `^9`, ver `package.json` raíz). Se
  revisa en una historia posterior cuando el plugin publique soporte, o se
  evalúa una alternativa. Mientras tanto, la accesibilidad se verifica
  manualmente y con las pruebas de Testing Library (que consultan por rol y
  texto accesible, no por selectores CSS).

## 7. Componentes fundamentales (`packages/ui`)

Ver [`packages/ui/README.md`](../../../packages/ui/README.md) para el detalle
de cada componente (`Button`/`buttonVariants`, `Input`, `Card`/`CardHeader`,
`Badge`, `PageLayout`/`PageHeader`, `Spinner`, `EmptyState`, `ErrorState`).
Ninguno decide reglas de negocio ni conoce las entidades de
`packages/shared-types`.

## 8. Infraestructura de datos (base, sin flujos de negocio)

- **Cliente HTTP** (`apps/web/src/lib/api/http-client.ts`): `fetch` tipado
  que aplica el prefijo `VITE_API_BASE_URL`, adjunta `Authorization: Bearer`
  cuando hay un proveedor de token configurado (placeholder hasta Sprint 1) y
  normaliza errores al formato `{ error: { code, message, details,
requestId } }` del contrato (`docs/api/contratos-api.md` §1.1) mediante la
  clase `ApiRequestError`.
- **TanStack Query** (`apps/web/src/lib/query-client.ts`): `QueryClient` con
  política de reintentos que no reintenta errores definitivos
  (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`).
- **Ejemplo de referencia** (`apps/web/src/examples/`): demuestra el patrón
  completo (query + estados de carga/vacío/error/éxito con
  `Spinner`/`EmptyState`/`ErrorState`) contra un **mock local** que respeta
  exactamente la forma de `MembershipPlansResponse`
  (`@activa-club/shared-types`), sin invocar `apiRequest`/`fetch` real (ver
  criterio de aceptación 7 de US-008). Solo visible en
  `/_dev/design-system` (modo desarrollo).
- **React Hook Form + Zod** (`apps/web/src/examples/ReferenceForm.tsx`):
  formulario mínimo de referencia con un esquema Zod local (no de negocio),
  `zodResolver`, y componentes `Input`/`Button` de `@activa-club/ui`. Las
  pantallas de Sprint 1 seguirán este mismo patrón pero usando los esquemas
  ya definidos en `packages/validation`.

## 9. Historial de cambios

- 2026-07-10: Versión inicial (US-008, Sprint 0).
