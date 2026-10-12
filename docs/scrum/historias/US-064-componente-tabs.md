# US-064 — Componente de pestañas

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-064                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 2                                                        |
| Dependencias        | US-061                                                   |

## Objetivo

Separar en pestañas lo que hoy está apilado en una misma pantalla (reservas próximas y pasadas; reservas pendientes y todas las reservas; instalaciones y mantenimiento), para que el usuario vea una sola cosa a la vez sin hacer scroll.

## Entregable

Componente `Tabs` exportado por `@activa-club/ui`, con pruebas.

## Valor de negocio

Atiende directamente el "solo tengo que scrollear" del dueño del producto en las pantallas con más de una sección.

## Criterios de aceptación

1. Muestra una lista de pestañas con etiqueta y, opcionalmente, un contador (por ejemplo "Pendientes (3)").
2. Solo el panel de la pestaña activa es visible.
3. Sigue el patrón de pestañas de WAI-ARIA: `role="tablist"`, `role="tab"` con `aria-selected` y `aria-controls`, y `role="tabpanel"` con `aria-labelledby`.
4. Las flechas izquierda y derecha mueven el foco y activan la pestaña siguiente o anterior (con vuelta al inicio), Inicio y Fin van a la primera y la última; solo la pestaña activa está en el orden de Tab.
5. Puede funcionar controlado por el llamador, para que la pestaña activa se guarde en la URL y sobreviva a una recarga o a "atrás".
6. En pantallas angostas, si las pestañas no caben, se desplazan horizontalmente dentro de su propia fila sin provocar desplazamiento horizontal de la página.
7. El componente no conoce reglas de negocio ni llama a la API.

## Sugerencia de pruebas funcionales

- Prueba de componente: flechas, Inicio, Fin y `aria-selected`.
- Pestaña guardada en la URL → recargar conserva la pestaña.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-03.
- Depende de: US-061.
- Habilita: US-074, US-076 (opcional), US-077.
