# US-069 — Catálogo de componentes y verificación automática de accesibilidad

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-069                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend + QA                                            |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Media                                                    |
| Estimación relativa | 2                                                        |
| Dependencias        | US-062, US-063, US-064, US-065, US-066, US-067           |

## Contexto

La base de diseño documenta como pendiente la verificación automática de accesibilidad (`apps/web/docs/design-foundation.md` §6: `eslint-plugin-jsx-a11y` sin soporte para ESLint 10). Los casos T-02 y UX-14 necesitan evidencia repetible, no solo revisión manual. El catálogo interno `/_dev/design-system` solo muestra botones, badges e input.

## Objetivo

Tener un lugar donde ver todos los componentes con sus estados y una prueba automática que falle si un componente introduce una violación de accesibilidad grave.

## Entregable

- `/_dev/design-system` ampliado con cada componente nuevo (US-062..US-067) y los tokens de US-061, solo en modo desarrollo como hoy.
- Verificación automática de accesibilidad (por ejemplo axe-core) en las pruebas de componentes de `packages/ui`, ejecutada por el CI existente.

## Valor de negocio

Evidencia objetiva para la tesis de que la interfaz es accesible, y una red de seguridad para no romperla en las épicas siguientes.

## Criterios de aceptación

1. El catálogo muestra cada componente del bloque A en sus estados principales (por ejemplo: ventana abierta con formulario, tabla con datos, vacía y con error; aviso de éxito y de error; stepper en el paso 2).
2. La ruta del catálogo sigue existiendo solo en modo desarrollo y no aparece en el paquete de producción.
3. Cada componente de `packages/ui` tiene al menos una prueba que ejecuta la verificación automática de accesibilidad y falla ante violaciones de impacto "serio" o "crítico".
4. La verificación corre en el CI de calidad sin pasos manuales adicionales.
5. La decisión sobre `eslint-plugin-jsx-a11y` (incorporarlo si ya soporta ESLint 10, o mantener la alternativa) queda registrada en la documentación de la base de diseño.

## Casos alternativos / excepciones

- **Falsos positivos conocidos** de la herramienta: se documentan y se desactivan regla por regla, nunca de forma global.

## Sugerencia de pruebas funcionales

- Introducir a propósito un botón sin nombre accesible en una rama de prueba → el CI falla.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-14, T-02.
- Depende de: US-062..US-067.
- Habilita: —
