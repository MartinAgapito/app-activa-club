# US-065 — Componente de tabla de datos responsive

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-065                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-061                                                   |

## Contexto

Las listas actuales (reservas del socio, reservas del administrador, instalaciones, bloqueos, solicitudes) son tarjetas apiladas: cada elemento ocupa mucho alto y comparar filas obliga a desplazarse. Las pantallas que vienen en EP-05, EP-06 y EP-07 (historial de avisos, padrón de socios, pagos) también son listados.

## Objetivo

Mostrar listados comparables de un vistazo en escritorio y legibles en móvil, con las acciones de cada fila a mano.

## Entregable

Componente `DataTable` exportado por `@activa-club/ui`, con pruebas.

## Valor de negocio

Un solo componente de listado para once pantallas actuales y futuras: menos scroll, más información por pantalla y un comportamiento idéntico en todas.

## Criterios de aceptación

1. El llamador define las columnas (encabezado, contenido de la celda, alineación) y una acción opcional por fila (por ejemplo "Ver detalle").
2. En pantallas de 640 px o más se muestra como tabla con encabezados (`<table>`, `<th scope="col">`), y la fila completa puede activarse con clic o con Enter si el llamador define una acción de fila.
3. En pantallas de menos de 640 px cada fila se muestra como tarjeta con pares etiqueta-valor, sin desplazamiento horizontal de la página.
4. Muestra estados de carga (`Spinner`), error (`ErrorState` con reintentar) y vacío (`EmptyState` con mensaje del llamador), en lugar de una tabla vacía.
5. Admite paginación por cursor con un botón "Cargar más", que se oculta cuando no hay más resultados, coherente con `{ items, nextCursor }` del contrato (§1).
6. Las celdas de estado usan `Badge` con texto, nunca solo color.
7. La tabla tiene un nombre accesible (título visible o `aria-label`).
8. El componente no conoce entidades de `packages/shared-types` ni llama a la API: recibe los datos ya cargados.

## Casos alternativos / excepciones

- **Ordenar por columna y filtros en el encabezado**: fuera de esta historia; los filtros siguen siendo controles del llamador sobre la tabla.

## Sugerencia de pruebas funcionales

- Prueba de componente: tres filas → tres filas; sin filas → estado vacío; con `nextCursor` → botón "Cargar más".
- Revisión manual en 375 px: tarjetas sin desplazamiento horizontal.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-05, T-03.
- Depende de: US-061.
- Habilita: US-071, US-074..US-078 y las pantallas de listado de EP-05, EP-06 y EP-07.
