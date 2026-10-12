# ADR-0013 — Primitivas accesibles de Radix UI para componentes interactivos

- **Estado**: Aceptado
- **Fecha**: 2026-10-11
- **Decisores**: Product Owner (decisión de producto), Frontend (implementación)
- **Historia relacionada**: [US-062](../../scrum/historias/US-062-componente-modal-accesible.md)
  (primer uso); aplica a los componentes interactivos de
  [EP-08](../../scrum/epicas/EP-08-experiencia-usuario-interfaz.md).

## Contexto

La design foundation (`packages/ui`) necesita componentes con comportamiento
complejo y fácil de hacer mal: ventana modal, menús, paneles laterales. Hacerlos
bien exige atrapar y devolver el foco, manejar teclado, ocultar el fondo a los
lectores de pantalla, bloquear el scroll y gestionar capas. El `ConfirmDialog`
original lo hacía a mano y fallaba en varios puntos (no atrapaba el foco, no lo
devolvía, ids fijos repetidos). El público incluye socios que usan teclado o
lector de pantalla, y la accesibilidad es un criterio de aceptación de EP-08.

## Decisión

Los componentes interactivos de `packages/ui` se construyen sobre **primitivas
sin estilo de Radix UI**, no reimplementando foco y teclado a mano. Se empieza
con `@radix-ui/react-dialog` en versión exacta **1.1.23** (publicada en julio de
2026, soporta React 19 en sus peer dependencies), añadida como dependencia de
`packages/ui`. Las primitivas aportan comportamiento y semántica; **toda la
apariencia sale de los tokens propios** (`surface-card`, `rounded-dialog`,
`z-layer-dialog`...). Cada componente expone una API propia y pequeña, de modo
que Radix queda como detalle interno y es reemplazable.

Se añadirán otras primitivas (`react-popover`, `react-dropdown-menu`...) solo
cuando una historia las necesite, fijando versión exacta.

## Alternativas consideradas

- **Implementación propia**: sin dependencia, pero repite un problema resuelto,
  con alto riesgo de regresiones de accesibilidad y costo de mantenimiento.
  Descartada.
- **React Aria (Adobe)**: muy completa y rigurosa en accesibilidad; su API de
  hooks y colecciones es más extensa y de mayor curva de aprendizaje, y exige
  más código por componente. Descartada por complejidad para el alcance del MVP.
- **Headless UI (Tailwind Labs)**: encaja con Tailwind, pero su catálogo es más
  reducido y está más acoplado a su estilo de transiciones. Descartada.

## Consecuencias

- **Positivas**: foco atrapado y devuelto, Escape, bloqueo de scroll y
  `aria-hidden` del fondo resueltos y mantenidos por terceros; menos código
  propio; base reutilizable para menús y paneles.
- **Negativas**: nueva dependencia de producción (cadena de paquetes
  `@radix-ui/*` y `react-remove-scroll`); aumenta el bundle en unos 39 kB sin
  comprimir (13 kB gzip) medidos con US-062; requiere vigilar actualizaciones y
  vulnerabilidades.
- **Matices**: Radix no establece `aria-modal` ni devuelve el foco cuando no hay
  `Dialog.Trigger`; `Modal` lo resuelve explícitamente. Los estilos siguen
  siendo Tailwind con tokens propios, sin tema de Radix.
- **Impacto**: solo frontend (`packages/ui`, `apps/web`). Sin cambios en
  backend, Terraform ni CI/CD más allá de la instalación de la dependencia.
