# US-078 — Revisar y decidir solicitudes de socios desde panel de detalle y ventana

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-078                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Media                                                    |
| Estimación relativa | 2                                                        |
| Dependencias        | US-062, US-063, US-065, US-066                           |

## Contexto

`/admin/solicitudes` (`PendingRequestsPage`, US-017) ya tiene un esquema de lista y detalle en dos columnas, con aprobar y rechazar (con motivo) mediante `ConfirmDialog`. Es la pantalla administrativa más avanzada; esta historia la alinea con el resto (tabla, panel lateral, avisos efímeros) para que todas se usen igual, y por eso es la de menor estimación.

## Historia

Como **administrador**, quiero **revisar cada solicitud de socio nuevo en un panel de detalle y aprobarla o rechazarla con motivo desde una ventana**, para **decidir con los datos completos y ver la lista actualizarse al instante**.

## Contrato de API

`GET /members?status=PENDING`, `GET /members/{memberId}`, `POST /members/{memberId}/approve` y `POST /members/{memberId}/reject` (con `reason`) (§4). Sin cambios en el servidor.

## Reglas de negocio

RN-ADM-02 (aprobación o rechazo de socios nuevos), RN-ACT-07 (el socio aprobado aún debe pagar su primera membresía).

## Valor de negocio

Consistencia: el administrador aprende un solo patrón (lista → panel → decisión en ventana → aviso) para socios y reservas.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Socio `APPROVED` o `REJECTED` (con motivo) (US-017).

## Criterios de aceptación

1. Las solicitudes pendientes se listan en la tabla de US-065 con nombre, DNI y fecha de solicitud (el correo y el teléfono se ven en el detalle), de la más antigua a la más reciente, con "Cargar más".
2. Al activar una fila se abre un panel lateral (US-063) con el detalle de `GET /members/{memberId}`; el panel tiene dirección propia (`?solicitud=<memberId>`).
3. En el pie del panel están "Aprobar" y "Rechazar".
4. "Aprobar" pide confirmación en ventana recordando que el socio deberá pagar su primera membresía para quedar activo (RN-ACT-07).
5. "Rechazar" abre una ventana con el motivo obligatorio; el botón de confirmar está deshabilitado mientras el motivo esté vacío.
6. Tras decidir con éxito, la ventana y el panel se cierran, la solicitud sale de la lista **sin recargar la página** y aparece un aviso efímero ("Solicitud aprobada", "Solicitud rechazada").
7. `CONFLICT` (otro administrador ya decidió) se muestra traducido dentro de la ventana y la lista se refresca al cerrarla.
8. Sin solicitudes, se muestra "No hay solicitudes pendientes".

## Sugerencia de pruebas funcionales

- Rechazar sin motivo → confirmar deshabilitado; con motivo → sale de la lista y aviso efímero.
- Abrir `/admin/solicitudes?solicitud=<id>` → panel abierto.
- Las pruebas existentes de `PendingRequestsPage.test.tsx` se adaptan sin perder casos.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-017 (EP-02).
- Reglas: RN-ADM-02, RN-ACT-07.
- Casos de prueba: UX-10, T-06.
- Depende de: US-062, US-063, US-065, US-066.
- Habilita: accesos a solicitudes de US-071 y US-059.
