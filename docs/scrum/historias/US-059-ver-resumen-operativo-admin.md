# US-059 — Ver el resumen operativo en el inicio del administrador

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-059                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Frontend                                         |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Alta                                             |
| Estimación relativa | 3                                                |
| Dependencias        | US-057                                           |

> **Nota de coordinación (EP-08, propuesta 2026-10-11):** si se aprueba [US-071](./US-071-inicio-admin-pendientes.md), esta historia no construye la página desde cero: reemplaza los contadores de pendientes (primera página de cada listado) por las cifras exactas de `GET /dashboard/admin` y agrega los bloques de socios por estado, membresías por vencer, pagos y notificaciones. Los criterios no cambian; puede reducirse su estimación en la Planning del Sprint 5.

## Historia

Como **administrador**, quiero **que mi inicio muestre los indicadores clave del club con acceso directo a lo que requiere acción**, para **empezar el día sabiendo qué atender primero**.

## Contrato de API

`GET /dashboard/admin` (US-057). Pantalla existente como placeholder: `/admin` (`AdminDashboardPage`).

## Reglas de negocio

RN-ADM-08 (consultar dashboards y métricas), RN-ANL-01, RN-ANL-02, RN-ANL-05, RN-ANL-06, RN-ANL-08.

## Valor de negocio

Convierte las cifras en una lista de pendientes: cada indicador lleva a la pantalla donde se resuelve.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Muestra los socios por estado, con el total, y un acceso al listado de socios filtrado por ese estado (US-051).
2. Muestra las solicitudes de socio pendientes con acceso a `/admin/solicitudes`, y las reservas pendientes de aprobación con acceso a la bandeja de reservas pendientes (US-034).
3. Muestra las membresías por vencer con acceso al filtro "Por vencer" (US-052).
4. Muestra los pagos exitosos y fallidos del período, indicando el período, con acceso a la consulta de pagos filtrada por estado (US-053).
5. Muestra la cantidad de notificaciones enviadas del período con acceso al historial (US-049).
6. Los indicadores que requieren acción (pendientes de aprobación, pagos fallidos) se destacan visualmente cuando son mayores que cero.
7. Tiene estados de carga y error, y un botón para actualizar; es responsive y accesible (las cifras no dependen solo del color).
8. Incluye un acceso a la analítica de reservas y ocupación (US-060).

## Casos alternativos / excepciones

- **Club sin datos** (ambiente recién desplegado): todos los indicadores en cero, sin error.
- **Gráficos de tendencia en el tiempo**: fuera de esta historia; la evolución de reservas está en US-060.

## Sugerencia de pruebas funcionales

- DA-03, DA-04, DA-07, DA-08 por interfaz: las cifras coinciden con la respuesta del servidor.
- Cada acceso directo abre la pantalla con el filtro correcto.
- T-06: un `member` no accede a `/admin`.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-ADM-08, RN-ANL-01, RN-ANL-02, RN-ANL-05, RN-ANL-06, RN-ANL-08.
- Casos de prueba: DA-03, DA-04, DA-07, DA-08, T-06.
- Depende de: US-057.
- Habilita: —
