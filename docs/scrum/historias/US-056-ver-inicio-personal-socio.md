# US-056 — Ver mi inicio personal (dashboard del socio)

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-056                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Frontend                                         |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Alta                                             |
| Estimación relativa | 5                                                |
| Dependencias        | US-055                                           |

> **Nota de coordinación (EP-08, propuesta 2026-10-11):** si se aprueba [US-070](./US-070-inicio-socio-datos-existentes.md), esta historia no construye la página desde cero: cambia la fuente del bloque de membresía a `GET /dashboard/member` (con `canReserve` y `alerts` del servidor, criterios 3, 4 y 11), y agrega los bloques de avisos recientes (criterio 7) y resumen de pagos (criterio 8). Los criterios no cambian; puede reducirse su estimación en la Planning del Sprint 5.

## Historia

Como **socio**, quiero **que al entrar a la plataforma mi inicio me muestre mi situación, mis próximas reservas, mis avisos y accesos directos a lo que más uso**, para **resolver lo que necesito sin tener que buscarlo**.

## Contrato de API

`GET /dashboard/member` (US-055) y, para el resumen breve de pagos, `GET /payments?limit=3` (§5, ya implementado). Pantalla existente como placeholder: `/socio` (`MemberDashboardPage`).

## Reglas de negocio

RN-PAG-06 y RN-RES-12 (alerta y bloqueo de reserva cuando no puede reservar). Contenido según el Contexto Maestro, sección "Dashboard del socio".

## Valor de negocio

Es la primera pantalla que ve el socio cada vez que entra y hoy dice "en construcción". Es además la pieza central de la demostración del producto.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Muestra una bienvenida con el nombre de pila del socio.
2. Muestra el estado de membresía con su etiqueta (activa, por vencer, vencida, con deuda), el tipo de plan, la fecha de vencimiento y los días restantes cuando corresponda.
3. Muestra las alertas de `alerts`; cuando el socio no puede reservar (`canReserve=false`), la alerta explica el motivo y ofrece el acceso a pagar o renovar su membresía.
4. Ofrece dos acciones destacadas: "Renovar o pagar membresía" (a la sección de membresía) y "Nueva reserva" (al flujo de reserva). Con `canReserve=false`, "Nueva reserva" aparece deshabilitada con el motivo, nunca oculta sin explicación.
5. Muestra las próximas reservas con instalación, fecha y hora en Lima y estado, y un acceso a "Mis reservas". Sin reservas, invita a reservar si puede hacerlo.
6. Muestra accesos directos a fútbol, piscina, tenis, pádel, parrillas y salón social, que llevan al flujo de reserva con la instalación preseleccionada.
7. Muestra los avisos recientes, con las no leídas destacadas, y un acceso a la bandeja (US-041).
8. Muestra un resumen breve de los últimos pagos (fecha, monto, estado) y un acceso al historial (US-050).
9. Cada bloque tiene su propio estado de carga y de error: si falla el resumen de pagos, el resto del inicio se muestra igual.
10. Es responsive (prioriza estado y acciones en móvil) y accesible.
11. La interfaz no decide por su cuenta si el socio puede reservar: usa `canReserve` del servidor.

## Casos alternativos / excepciones

- **Socio recién activado sin reservas, pagos ni avisos**: el inicio se muestra completo con estados vacíos amables.
- **Novedades del club** que no son notificaciones (noticias, banners): no hay contrato; se entienden como los avisos publicados por el administrador (US-048), que ya aparecen entre los recientes.

## Sugerencia de pruebas funcionales

- DA-01 por interfaz: socio con deuda → alerta, acción de pago y "Nueva reserva" deshabilitada con motivo.
- Socio al día con reservas → próximas reservas ordenadas y accesos funcionando.
- Fallo simulado de `GET /payments` → el resto del inicio se muestra.
- T-01: viewport móvil y escritorio.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-PAG-06, RN-RES-12.
- Casos de prueba: DA-01, DA-02 (por interfaz), T-01, T-03.
- Depende de: US-055 (y US-050 para el acceso al historial de pagos).
- Habilita: —

## Historial de cambios

- 2026-10-12: Implementada en frontend, pendiente verificación en `dev`. `MemberDashboardPage` usa un único hook (`useMemberDashboardQuery`, `apps/web/src/dashboard/`) sobre `GET /dashboard/member`; conserva el diseño de US-070 (bloques, tokens, `AppShell`). `canReserve` y `alerts` vienen del servidor (criterio 11). Agrega avisos recientes (criterio 7), resumen de los últimos tres pagos con estado propio (criterios 8 y 9) y accesos por instalación hacia `/socio/reservas?tipo=` (criterio 6). Decisiones: el resumen de reservas del contrato no incluye nombre de la instalación ni hora de fin, así que se muestra el tipo de instalación y la hora de inicio (detalle en "Mis reservas"); "días restantes" usa `daysRemaining` del contrato y solo en membresías vigentes; sin primera membresía (`NONE`, alertas vacías, `canReserve=false`) se explica qué falta sin inventar códigos de alerta.
