# US-020 — Consultar los planes de membresía disponibles

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-020                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Backend + Frontend                           |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Alta                                         |
| Estimación relativa | 3                                            |
| Dependencias        | US-019                                       |

## Historia

Como **socio**, quiero **ver los planes de membresía disponibles con su precio y duración**, para **elegir con información clara si pago la membresía mensual o la anual**.

## Contrato de API

`GET /memberships/plans` (member y admin), según `docs/api/contratos-api.md` §5.

## Reglas de negocio

RN-PAG-01 (existen membresías mensual y anual), RN-PAG-02 (la anual contempla facilidades de pago con tarjeta, sujeto a la integración disponible).

## Valor de negocio

Es el punto de entrada del flujo de pago: sin una lista de planes confiable y con precios provenientes del backend, el socio no puede decidir qué comprar y el frontend no puede construir el checkout. Centralizar los montos en el backend evita que los precios queden escritos en el cliente, donde podrían manipularse o desincronizarse.

## Precondiciones

- El usuario tiene sesión iniciada (rol `member` o `admin`).

## Postcondiciones

- Ninguna; la operación es de solo lectura y no modifica el estado del socio.

## Criterios de aceptación

1. `GET /memberships/plans` devuelve 200 con al menos los planes `MONTHLY` y `ANNUAL`, cada uno con `type`, `amount` (en céntimos), `currency` (`PEN`) y `label`.
2. El plan `ANNUAL` indica mediante `allowsInstallments` si admite facilidades de pago con tarjeta; el valor refleja la capacidad realmente disponible en la integración de Culqi sandbox, no una promesa fija.
3. Los montos provienen del backend (parametrizables por configuración de ambiente) y **no** están escritos en el código del frontend.
4. El socio ve los planes en la sección de membresía con precio formateado en soles (el monto se guarda en céntimos y se muestra en la unidad correcta), etiqueta y duración de la vigencia que otorga cada plan.
5. Si el socio ya tiene una membresía vigente, la interfaz indica hasta cuándo está vigente y que el pago de un plan extiende la vigencia (RN-PAG-01), sin bloquear la consulta.
6. Un usuario sin sesión que intenta consultar los planes recibe 401 y la interfaz lo lleva al login.
7. La pantalla es responsive y accesible, con estados de carga, error y reintento.
8. Ningún dato de tarjeta interviene en este flujo.

## Casos alternativos / excepciones

- El backend no puede resolver la configuración de planes: responde 500 y la interfaz muestra un estado de error con opción de reintentar, sin ofrecer un precio por defecto inventado en el cliente.
- Si `allowsInstallments` es `false` para el plan anual, la interfaz no ofrece facilidades de pago (RN-PAG-02 queda cubierta con la mención "sujeto a la integración disponible").
- Un `admin` puede consultar los planes con fines de verificación, pero no dispone de acción de pago (los pagos son del socio, RN-PAG-05: no hay pagos manuales registrados por administrador).

## Sugerencia de pruebas funcionales

- P-01: `GET /memberships/plans` devuelve mensual y anual con montos correctos.
- P-12: el plan anual expone `allowsInstallments` coherente con la integración disponible.
- Consulta sin token → 401.
- Renderizado de la lista de planes con precios formateados y estado de carga/error.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-01, RN-PAG-02.
- Casos de prueba: P-01, P-12.
- Depende de: US-019 (endpoint desplegado).
- Habilita: US-022 (checkout), US-023 (renovación).
