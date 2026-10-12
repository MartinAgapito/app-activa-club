# Design foundation — Activa Club (Frontend)

> **Versión 2.0** (US-061, Sprint 4B). Entregable original de
> [US-008](../../../docs/scrum/historias/US-008-mapa-rutas-design-foundation.md)
> (Sprint 0, fundación), ampliado por
> [US-061](../../../docs/scrum/historias/US-061-ampliar-tokens-diseno.md). Sin lógica de negocio: tokens y componentes visuales
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

## 3. Tokens semánticos (US-061)

Los componentes y pantallas usan **solo estos nombres**, no `slate-*` ni
colores a mano. Viven en `apps/web/src/styles/theme.css` en dos capas:
variables `:root` con los valores del modo claro y alias `@theme inline` que
generan las utilidades de Tailwind. Un modo oscuro futuro solo sobrescribiría
las variables `:root` (**no está activo**: fuera de alcance de US-061; no hay
reglas en `prefers-color-scheme`).

### 3.1 Color

| Token (utilidad)             | Valor                 | Relación con la escala / uso                             |
| ---------------------------- | --------------------- | -------------------------------------------------------- |
| `surface-app` (`bg-`)        | `#f3f5f9`             | Fondo de aplicación (antes `slate-50`)                   |
| `surface-card`               | `#ffffff`             | Tarjetas, cabecera, campos                               |
| `surface-raised`             | `#f7f8fb`             | Superficie elevada/secundaria, campo deshabilitado       |
| `surface-brand-soft`         | `#e9eefa`             | Fondo suave de marca (hover de secundario, badge `info`) |
| `ink` (`text-`)              | `#13203b`             | Texto principal                                          |
| `ink-muted`                  | `#566280`             | Texto secundario, ayudas, placeholder                    |
| `ink-disabled`               | `#7f8aa3`             | Texto deshabilitado (exento de AA, WCAG 1.4.3)           |
| `ink-on-brand`               | `#ffffff`             | Texto sobre `action`/marca                               |
| `line` (`border-`)           | `#dde3ee`             | Separación decorativa (tarjeta, cabecera)                |
| `line-strong`                | `#7f8aa3`             | Borde de controles (3:1, WCAG 1.4.11)                    |
| `focus` (`ring-`, contorno)  | `#5178c9`             | = `brand-400`. Anillo de foco                            |
| `action`                     | `#243d7a`             | = `brand-600`. Acción principal                          |
| `action-hover`               | `#1b2e5e`             | = `brand-700`                                            |
| `action-pressed`             | `#142347`             | = `brand-800`                                            |
| `status-confirmed` / `-soft` | `#0c6e5b` / `#dcf6ee` | texto = `positive-700`                                   |
| `status-pending` / `-soft`   | `#8a4b00` / `#fdf0d2` | Ámbar oscuro (fuera de la escala `warning`)              |
| `status-problem` / `-soft`   | `#a3231b` / `#fbe4e1` | Rojo de estado (más vivo que `danger-600`)               |

Las escalas `brand`, `positive`, `warning` y `danger` (sección 2) se conservan
sin cambios; los semánticos las evolucionan, no las reemplazan. Los estados de
dominio se muestran con `Badge` (variantes `positive`/`warning`/`danger` usan
ahora `status-*`) y nunca solo con color: siempre con texto.

### 3.2 Tipografía

Familias, servidas desde el propio sitio con `@fontsource` (subconjunto
`latin`, `font-display: swap`; sin CDN ni Google Fonts):

- `font-display` (`--font-display`): **Barlow Semi Condensed** 500/600/700 —
  títulos, cifras y horas.
- `font-sans` (`--font-sans`): **Hanken Grotesk** 400/500/600/700 — interfaz.
- Respaldo: `Segoe UI`, `system-ui`, `Arial`...

Base 15px, interlineado 1.5, líneas de lectura de hasta 65ch (utilidad
`measure`).

| Rol (utilidad)       | Familia | Tamaño           | Interlineado | Peso                   |
| -------------------- | ------- | ---------------- | ------------ | ---------------------- |
| `type-page-title`    | display | 1.625rem (26px)  | 1.2          | 600                    |
| `type-section-title` | display | 1.25rem (20px)   | 1.3          | 600                    |
| `type-card-title`    | display | 1.0625rem (17px) | 1.35         | 600                    |
| `type-body`          | sans    | 0.9375rem (15px) | 1.5          | 400                    |
| `type-aux`           | sans    | 0.8125rem (13px) | 1.45         | 400                    |
| `type-figure`        | display | 2.25rem (36px)   | 1.1          | 700 (cifras tabulares) |

La escala por defecto de Tailwind (`text-sm`, `text-xl`...) sigue disponible
para pantallas aún no migradas.

### 3.3 Radios, elevación y capas

| Token             | Valor                          | Uso               |
| ----------------- | ------------------------------ | ----------------- |
| `rounded-control` | 8px                            | Botones, campos   |
| `rounded-card`    | 12px                           | Tarjetas, paneles |
| `rounded-dialog`  | 14px                           | Ventanas          |
| `shadow-card`     | 0 1px 2px y 0 1px 3px (6%, 5%) | Tarjeta           |
| `shadow-panel`    | 0 8px 24px (14%)               | Panel lateral     |
| `shadow-dialog`   | 0 16px 40px (18%)              | Ventana           |
| `shadow-toast`    | 0 6px 18px (20%)               | Aviso efímero     |

Orden único de capas (`z-index`; variables `--layer-*`, utilidades
`z-layer-*`): contenido (0) < cabecera fija (20) < panel lateral (40) <
ventana (50) < aviso efímero (80).

### 3.4 Estados de interacción y movimiento

- **Hover / presionado**: `hover:bg-action-hover`, `active:bg-action-pressed`
  (acción principal); `hover:bg-surface-brand-soft` en secundario y ghost.
- **Deshabilitado**: utilidad `state-disabled` (opacidad
  `--state-disabled-opacity` 0.55, cursor `not-allowed`); texto `ink-disabled`.
- **Foco visible**: utilidad `focus-ring` y regla global `:focus-visible`:
  contorno de 2px `focus`, desfase 2px.
- **Movimiento**: `--motion-fast` 120ms (controles), `--motion-base` 200ms
  (paneles, ventanas), curva `--motion-ease`. Uso:
  `transition-colors duration-(--motion-fast) ease-(--motion-ease)`. Con
  `prefers-reduced-motion: reduce` toda transición se reduce a 0.01ms (regla
  global en `theme.css`). El spinner de carga se conserva (comunica progreso).

### 3.5 Contraste WCAG 2.1 AA

Verificado con cálculo de luminancia relativa real
(`node apps/web/scripts/check-contrast.mjs`, que lee `theme.css` y sale con
error si un par falla). Mínimos: 4.5:1 texto normal; 3:1 texto grande y
componentes de interfaz/foco.

| Par                                      | Primer plano | Fondo     | Ratio   | Mínimo | Resultado |
| ---------------------------------------- | ------------ | --------- | ------- | ------ | --------- |
| Texto principal / app                    | `#13203b`    | `#f3f5f9` | 14.83:1 | 4.5:1  | cumple    |
| Texto principal / tarjeta                | `#13203b`    | `#ffffff` | 16.19:1 | 4.5:1  | cumple    |
| Texto principal / elevada                | `#13203b`    | `#f7f8fb` | 15.24:1 | 4.5:1  | cumple    |
| Texto principal / marca suave            | `#13203b`    | `#e9eefa` | 13.93:1 | 4.5:1  | cumple    |
| Texto secundario / app                   | `#566280`    | `#f3f5f9` | 5.57:1  | 4.5:1  | cumple    |
| Texto secundario / tarjeta               | `#566280`    | `#ffffff` | 6.08:1  | 4.5:1  | cumple    |
| Texto secundario / elevada               | `#566280`    | `#f7f8fb` | 5.72:1  | 4.5:1  | cumple    |
| Texto secundario / marca suave           | `#566280`    | `#e9eefa` | 5.23:1  | 4.5:1  | cumple    |
| Texto sobre marca / acción               | `#ffffff`    | `#243d7a` | 10.38:1 | 4.5:1  | cumple    |
| Texto sobre marca / acción hover         | `#ffffff`    | `#1b2e5e` | 13.13:1 | 4.5:1  | cumple    |
| Texto sobre marca / acción presionada    | `#ffffff`    | `#142347` | 15.43:1 | 4.5:1  | cumple    |
| Acción (enlace, secundario) / tarjeta    | `#243d7a`    | `#ffffff` | 10.38:1 | 4.5:1  | cumple    |
| Acción (enlace) / app                    | `#243d7a`    | `#f3f5f9` | 9.51:1  | 4.5:1  | cumple    |
| Acción / marca suave                     | `#243d7a`    | `#e9eefa` | 8.93:1  | 4.5:1  | cumple    |
| Confirmado / fondo suave                 | `#0c6e5b`    | `#dcf6ee` | 5.43:1  | 4.5:1  | cumple    |
| Pendiente / fondo suave                  | `#8a4b00`    | `#fdf0d2` | 6.02:1  | 4.5:1  | cumple    |
| Problema / fondo suave                   | `#a3231b`    | `#fbe4e1` | 6.14:1  | 4.5:1  | cumple    |
| Problema (error en formulario) / tarjeta | `#a3231b`    | `#ffffff` | 7.46:1  | 4.5:1  | cumple    |
| Problema (error) / app                   | `#a3231b`    | `#f3f5f9` | 6.84:1  | 4.5:1  | cumple    |
| Texto sobre botón positivo               | `#ffffff`    | `#0c6e5b` | 6.18:1  | 4.5:1  | cumple    |
| Texto sobre botón destructivo            | `#ffffff`    | `#a3231b` | 7.46:1  | 4.5:1  | cumple    |
| Texto sobre botón alerta                 | `#5c350c`    | `#f0980f` | 4.67:1  | 4.5:1  | cumple    |
| Texto sobre botón alerta hover           | `#5c350c`    | `#f7b12e` | 5.73:1  | 4.5:1  | cumple    |
| Foco / tarjeta (no texto)                | `#5178c9`    | `#ffffff` | 4.30:1  | 3:1    | cumple    |
| Foco / app (no texto)                    | `#5178c9`    | `#f3f5f9` | 3.94:1  | 3:1    | cumple    |
| Foco / marca suave (no texto)            | `#5178c9`    | `#e9eefa` | 3.70:1  | 3:1    | cumple    |
| Borde de control / tarjeta (no texto)    | `#7f8aa3`    | `#ffffff` | 3.46:1  | 3:1    | cumple    |
| Borde de control / app (no texto)        | `#7f8aa3`    | `#f3f5f9` | 3.17:1  | 3:1    | cumple    |

Notas y desviaciones:

- Ningún valor aprobado por el dueño del producto fue modificado.
- `line` (`#dde3ee`, 1.29:1 sobre blanco) es **solo separación decorativa**
  (tarjetas, cabecera). Los bordes de controles de formulario usan
  `line-strong` para cumplir 3:1 (WCAG 1.4.11).
- `line-strong` e `ink-disabled` no estaban en los valores aprobados; se fijaron
  en `#7f8aa3`, el gris azulado más claro que alcanza 3:1 sobre el fondo de
  aplicación. `ink-disabled` es texto inactivo, exento de contraste.
- Ajustes a componentes existentes por contraste: el botón `positive` pasó de
  `positive-600` (4.29:1 con blanco, no cumplía) a `positive-700` (6.18:1); el
  hover del botón `warning` pasó de `warning-600` (3.23:1) a `warning-400`
  (5.73:1).

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
  cuando hay un proveedor de token configurado y normaliza errores al formato
  `{ error: { code, message, details, requestId } }` del contrato
  (`docs/api/contratos-api.md` §1.1) mediante la clase `ApiRequestError`.
  Desde US-014 (Sprint 1), `AuthContext` conecta `setAccessTokenProvider` con
  el access token de Cognito vigente en memoria.
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
- 2026-10-11: Versión 2.0 (US-061, Sprint 4B). Tokens semánticos de superficie,
  texto, borde, acción y estado; escala tipográfica nombrada; radios,
  elevación, capas y movimiento; fuentes Barlow Semi Condensed y Hanken
  Grotesk autoalojadas (reemplazan la preferencia por Inter); `Button`,
  `Card`, `Badge`, `Input`, `Textarea` y `PageLayout` migrados sin cambiar su
  API; tabla de contrastes AA; muestra en `/_dev/design-system`. Modo oscuro
  preparado en la estructura, no activado.
