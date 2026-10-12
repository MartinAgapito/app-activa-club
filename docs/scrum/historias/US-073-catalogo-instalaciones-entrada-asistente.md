# US-073 — Elegir la instalación desde un catálogo visual que abre el asistente

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-073                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Media                                                    |
| Estimación relativa | 2                                                        |
| Dependencias        | US-072                                                   |

## Historia

Como **socio**, quiero **ver las instalaciones del club como un catálogo visual y empezar una reserva directamente desde la que me interesa**, para **reservar en menos pasos lo que ya sé que quiero**.

## Contrato de API

`GET /resources` (§6). Sin cambios en el servidor.

## Valor de negocio

Convierte `/socio/reservas` de una página larga en una portada de instalaciones, y permite que el inicio del socio ofrezca accesos directos por instalación.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Ninguna por sí misma; la reserva la crea el asistente (US-072).

## Criterios de aceptación

1. `/socio/reservas` muestra las instalaciones en una cuadrícula de tarjetas (una columna en móvil, dos o tres en escritorio) agrupadas por tipo, con icono o imagen del tipo, nombre, aforo, duración del bloque, estado (disponible o en mantenimiento) y la indicación "Requiere aprobación" en parrillas y salón social.
2. Cada tarjeta tiene el botón "Reservar", que abre el asistente de US-072 en el paso 2 con esa instalación preseleccionada.
3. Una instalación en mantenimiento muestra el estado y su botón sigue habilitado (puede haber franjas libres otros días); el asistente informa las franjas bloqueadas.
4. La dirección `/socio/reservas?recurso=<resourceId>` abre el asistente con esa instalación preseleccionada; un `resourceId` inexistente muestra el catálogo con un aviso "No encontramos esa instalación".
5. La dirección `/socio/reservas?tipo=<tipo>` muestra el catálogo filtrado por ese tipo; si el tipo tiene una sola instalación (por ejemplo, la piscina), abre directamente el asistente con ella. El inicio del socio (US-070) ofrece accesos directos a fútbol, piscina, tenis, pádel, parrillas y salón social que usan esa dirección.
6. Un botón "Nueva reserva" en la cabecera de la página abre el asistente en el paso 1.
7. Si el socio no puede reservar, los botones "Reservar" y "Nueva reserva" se deshabilitan con el motivo visible y un acceso al pago, igual que en US-072 (criterio 12).
8. Estados de carga, error y vacío del catálogo cubiertos.

## Casos alternativos / excepciones

- **Pregunta abierta 5 de EP-08 sin resolver**: se usan iconos por tipo de instalación en lugar de imágenes.

## Sugerencia de pruebas funcionales

- Clic en "Reservar" de la piscina → asistente en el paso 2 con la piscina elegida.
- Abrir `/socio/reservas?recurso=tenis-1` → asistente abierto con tenis.
- Abrir `/socio/reservas?tipo=FUTBOL` → catálogo con las dos canchas de fútbol; `?tipo=PISCINA` → asistente abierto con la piscina.
- Revisión en 375 px.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-032 (criterio 1).
- Casos de prueba: UX-07, UX-05.
- Depende de: US-072.
- Habilita: accesos por instalación de US-070 y US-056 (criterio 6).
