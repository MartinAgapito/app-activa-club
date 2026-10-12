# US-071 — Ver lo que requiere mi atención al entrar (inicio del administrador)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-071                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque B — inicio útil)             |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-065, US-068                                           |

## Contexto

`/admin` (`AdminDashboardPage`) es un placeholder "en construcción". El resumen operativo con las ocho métricas del MVP es US-059 (EP-07, Sprint 5) y depende de `GET /dashboard/admin` (US-057), que aún no existe. Esta historia entrega ya un inicio orientado a la acción con los endpoints existentes, construido para que US-059 lo enriquezca.

## Historia

Como **administrador**, quiero **ver al entrar las solicitudes de socios y las reservas que esperan mi decisión, y accesos directos a las tareas frecuentes**, para **atender primero lo pendiente sin recorrer cada sección**.

## Contrato de API

Solo endpoints ya implementados:

- `GET /members?status=PENDING&limit=5` (§4): solicitudes de socio pendientes.
- `GET /reservations?scope=all&status=PENDING_APPROVAL&limit=5` (§7): reservas de parrilla y salón por aprobar, con `holder`.

Sin cambios en el servidor. Los listados son paginados y no devuelven un total: el total exacto llega con US-057/US-059.

## Reglas de negocio

RN-ADM-02 (aprobación de socios), RN-RES-02 (aprobación de parrillas y salón social).

## Valor de negocio

Convierte el inicio vacío en la lista de trabajo del día y es la portada de la demostración del lado administrativo.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna; es de solo lectura (las decisiones se toman en las pantallas de destino).

## Criterios de aceptación

1. Un bloque **"Solicitudes de socio pendientes"** muestra la cantidad y las cinco más antiguas (nombre, DNI, fecha de solicitud) en la tabla de US-065. Si hay más de cinco (`nextCursor` no nulo) la cantidad se muestra como "5 o más", nunca como un total inventado.
2. Cada solicitud lleva a `/admin/solicitudes` con esa solicitud abierta en su panel de detalle (cuando US-078 esté disponible; antes, a la lista).
3. Un bloque **"Reservas por aprobar"** muestra la cantidad con la misma regla y las cinco más próximas (instalación, fecha y franja en hora de Lima, titular). Cada una lleva a `/admin/reservas` en la pestaña de pendientes con esa reserva abierta (cuando US-077 esté disponible; antes, a la lista).
4. Los bloques con pendientes mayores que cero se destacan visualmente y con texto ("Requiere tu atención"); sin pendientes, muestran "Nada pendiente" en lugar de una tabla vacía.
5. Un bloque de **accesos rápidos** ofrece "Bloquear una instalación por mantenimiento", "Ver instalaciones", "Ver todas las reservas" y "Ver socios".
6. Cada bloque carga, falla y se reintenta de forma independiente, y hay un botón "Actualizar" que recarga todos.
7. La página está construida como bloques independientes, para que US-059 reemplace los contadores por las cifras exactas de `GET /dashboard/admin` y agregue los bloques de métricas sin reescribirla.
8. Es responsive y accesible: cada bloque es una sección con título y las cantidades no dependen solo del color.

## Casos alternativos / excepciones

- **Club recién desplegado sin pendientes**: ambos bloques muestran "Nada pendiente", sin error.
- **Métricas (socios por estado, pagos, ocupación)**: fuera de esta historia; requieren backend (US-057, US-058) y llegan con US-059 y US-060.

## Sugerencia de pruebas funcionales

- Dos solicitudes y una reserva pendientes → cantidades 2 y 1, filas y accesos correctos.
- Siete solicitudes → "5 o más" y cinco filas.
- Fallo simulado de `GET /members` → el bloque de reservas se muestra igual.
- T-06: un `member` no accede a `/admin`.

## Trazabilidad

- Épica: EP-08 (bloque B).
- Reglas: RN-ADM-02, RN-RES-02.
- Casos de prueba: UX-13, T-03, T-06.
- Depende de: US-065, US-068.
- Habilita: US-059 (la enriquece; ver EP-08, "Relación con EP-07").
