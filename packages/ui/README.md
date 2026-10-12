# packages/ui

Design foundation de Activa Club: componentes visuales fundamentales,
reutilizables entre pantallas, **sin lógica de negocio**. Entregable de
[US-008](../../docs/scrum/historias/US-008-mapa-rutas-design-foundation.md).

Los tokens de color/tipografía/espaciado viven como tema de Tailwind CSS en
`apps/web` (única app que compila CSS por ahora); ver
[`apps/web/docs/design-foundation.md`](../../apps/web/docs/design-foundation.md)
para la referencia completa de tokens. Este paquete asume que las clases de
utilidad que usa (`bg-brand-700`, `text-danger-600`, etc.) están disponibles
en el proyecto que lo consume.

## Componentes

| Componente                 | Uso previsto                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Button`                   | Acciones primarias/secundarias/positivas/de alerta/destructivas                                      |
| `Input`                    | Campo de formulario accesible (label, error, texto de ayuda)                                         |
| `Card`, `CardHeader`       | Contenedor de contenido agrupado                                                                     |
| `Badge`                    | Estado (membresía, reserva, pago, socio) — la traducción `estado → variante` la define cada pantalla |
| `PageLayout`, `PageHeader` | Estructura de página responsive (mobile-first)                                                       |
| `Spinner`                  | Estado de carga                                                                                      |
| `EmptyState`               | Estado vacío (listados sin datos, placeholders de Sprint 0)                                          |
| `ErrorState`               | Estado de error, alineado al formato de error del contrato de API                                    |
| `DataTable`                | Tabla responsive (tarjetas bajo 640 px), acción de fila, estados y "Cargar más" (US-065)             |
| `Stepper`                  | Indicador de pasos (lista ordenada, forma compacta en móvil); completados clicables opcionalmente    |

> **US-061**: `Button`, `Card`, `Badge`, `Input`, `Textarea` y `PageLayout`
> usan los tokens semánticos (`bg-surface-card`, `text-ink`, `border-line`,
> `rounded-control`, `shadow-card`, `type-card-title`...) definidos en
> `apps/web/src/styles/theme.css`. Los componentes nuevos deben usar esos
> nombres y no colores `slate-*` a mano. Ver §3 de `design-foundation.md`.

## Convenciones

- Ningún componente hace `fetch`, decide reglas de negocio (aforo, deuda,
  aprobación, etc.) ni conoce las entidades de `packages/shared-types`. Esa
  responsabilidad es de las pantallas de `apps/web` (Sprint 1+).
- Todos los componentes son accesibles por defecto (asociación label/error,
  roles ARIA, foco visible) y responsive mobile-first.
- Extiende la configuración estricta compartida (`tsconfig.base.json`) y el
  ESLint raíz (`eslint.config.js`, ver `packages/ui/eslint.config.js`).

## Scripts

```bash
npm run typecheck -w @activa-club/ui
npm run lint -w @activa-club/ui
npm run test -w @activa-club/ui
```
