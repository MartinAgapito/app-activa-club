# US-067 — Componente indicador de pasos (stepper)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-067                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 1                                                        |
| Dependencias        | US-061                                                   |

## Objetivo

Indicar en qué paso de un flujo está el usuario, cuáles completó y cuántos faltan, empezando por el asistente de reserva (US-072).

## Entregable

Componente `Stepper` exportado por `@activa-club/ui`, con pruebas.

## Valor de negocio

Convierte el flujo de reserva, hoy una página larga, en una secuencia corta y predecible.

## Criterios de aceptación

1. Recibe la lista de pasos (etiqueta) y el índice del paso actual; cada paso se muestra como completado, actual o pendiente, con texto y no solo con color.
2. Se presenta como una lista ordenada con el paso actual marcado con `aria-current="step"`.
3. Los pasos completados pueden volverse clicables si el llamador lo permite (para volver atrás); los pendientes nunca son clicables.
4. En pantallas de menos de 640 px muestra la forma compacta "Paso 2 de 4: Día y franja" en lugar de todas las etiquetas.
5. El componente no conoce reglas de negocio ni llama a la API.

## Sugerencia de pruebas funcionales

- Prueba de componente: `aria-current` en el paso actual; un paso pendiente no responde al clic.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-08.
- Depende de: US-061.
- Habilita: US-072.
