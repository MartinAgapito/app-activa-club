# US-063 — Componente de panel lateral (drawer)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-063                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 2                                                        |
| Dependencias        | US-062                                                   |

## Objetivo

Mostrar el detalle de un elemento de una lista (una reserva, una solicitud de socio) o el menú de navegación en móvil en un panel que se desliza desde el borde, sin perder la lista de fondo.

## Entregable

Componente `Drawer` exportado por `@activa-club/ui`, que reutiliza el manejo de foco y de accesibilidad de `Modal` (US-062), con pruebas.

## Valor de negocio

Permite revisar el detalle y actuar sobre él sin navegar a otra pantalla ni hacer scroll hasta otra sección, que es el patrón que hoy falta en Mis reservas y en las pantallas del administrador.

## Criterios de aceptación

1. El panel se abre desde el borde derecho (detalle) o izquierdo (navegación), según lo indique el llamador.
2. Tiene título obligatorio, contenido desplazable y una zona de acciones opcional fija al pie.
3. Cumple los criterios de foco y accesibilidad de US-062: foco inicial, foco atrapado, Escape cierra, foco devuelto al control que lo abrió, `role="dialog"`, `aria-modal="true"` e identificadores únicos.
4. En pantallas de 1024 px o más ocupa un ancho fijo (entre 400 y 480 px) y deja ver la lista de fondo atenuada.
5. En pantallas de menos de 640 px ocupa todo el ancho.
6. La apertura y el cierre se animan con los tokens de movimiento de US-061 y no se animan si el sistema pide reducir movimiento.
7. El componente no conoce reglas de negocio ni llama a la API.

## Casos alternativos / excepciones

- **Contenido aún cargando**: el llamador muestra `Spinner` dentro del panel; el panel no espera a los datos para abrirse.

## Sugerencia de pruebas funcionales

- Prueba de componente con los mismos casos de foco y Escape que US-062.
- Revisión manual en 375 px y en 1280 px.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-02.
- Depende de: US-062.
- Habilita: US-068, US-074, US-077, US-078.
