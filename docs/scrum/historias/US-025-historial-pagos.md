# US-025 — Consultar el historial de pagos (socio y administrador)

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-025                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Backend + Frontend                           |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Media                                        |
| Estimación relativa | 5                                            |
| Dependencias        | US-021                                       |

## Historia

Como **socio**, quiero **ver el historial de mis pagos con su fecha, monto, plan y estado**, para **saber qué pagué, hasta cuándo estoy cubierto y verificar un cobro cuando tenga dudas**.

Como **administrador**, quiero **consultar los pagos de los socios filtrando por estado y por socio**, para **atender reclamos y verificar la situación de un socio sin depender del sistema on-premise**.

## Contrato de API

`GET /payments` (member: propio; admin: filtrado) y `GET /payments/{paymentId}` (member: propio; admin: cualquiera), según `docs/api/contratos-api.md` §5. Paginación por cursor opaco `?cursor=&limit=` con respuesta `{ items, nextCursor }` (convención §2). Filtros admitidos: `memberId` (solo admin), `status`.

## Reglas de negocio

RN-PAG-04 (los pagos son digitales y quedan registrados), RN-PAG-08 (nunca datos de tarjeta ni secretos), RN-ADM-03 (consulta administrativa de pagos).

## Valor de negocio

El historial es la evidencia del socio y la herramienta de soporte del administrador: sin él, cualquier duda sobre un cobro obliga a revisar el panel del proveedor de pagos o el sistema legado. También es el lugar donde el socio verifica un pago que quedó en verificación (`PENDING_CONFIRMATION`), cerrando el ciclo del checkout.

## Precondiciones

- El usuario tiene sesión iniciada con rol `member` o `admin`.
- Existen pagos registrados (US-021).

## Postcondiciones

- Ninguna; ambas operaciones son de solo lectura.

## Criterios de aceptación

1. `GET /payments` con rol `member` devuelve **solo** los pagos del socio autenticado, ordenados del más reciente al más antiguo, con paginación por cursor.
2. Cada elemento del historial incluye fecha, tipo de membresía, monto, moneda y estado (`SUCCEEDED`, `PENDING_CONFIRMATION`, `FAILED`); los estados se muestran con etiquetas comprensibles en español, no con el código crudo.
3. `GET /payments` con rol `admin` permite filtrar por `memberId` y por `status`; sin filtro devuelve los pagos según la convención de listado paginado.
4. Un `member` que envía el filtro `memberId` de otro socio **no** obtiene datos ajenos: el backend ignora el filtro o responde 403, y en ningún caso devuelve pagos de terceros.
5. `GET /payments/{paymentId}` devuelve el detalle del pago; un `member` que solicita un pago que no le pertenece recibe 403 (o 404 si se prefiere no revelar la existencia del recurso), nunca los datos.
6. Un `paymentId` inexistente devuelve 404 `NOT_FOUND`.
7. Ninguna respuesta incluye PAN, CVV ni secretos de Culqi; el único identificador externo expuesto es `culqiChargeId` (RN-PAG-08).
8. El socio ve su historial en su sección de pagos, con estado vacío informativo cuando aún no tiene pagos ("todavía no registras pagos").
9. El administrador accede al historial desde su área de administración, con filtro por estado y por socio, y con paginación.
10. Un pago en `PENDING_CONFIRMATION` se muestra como "en verificación" y se actualiza al recargar cuando el webhook lo confirma (US-024).
11. Las pantallas son responsive y accesibles, con estados de carga, error, vacío y paginación operables por teclado.
12. La restricción de visibilidad (propio vs. ajeno) se valida en el backend, nunca solo en el frontend.

## Casos alternativos / excepciones

- **Socio sin pagos**: estado vacío, sin error.
- **Socio migrado**: no existen pagos históricos, porque la migración de pagos detallados está fuera de alcance (matriz §1); la interfaz no debe sugerir que faltan datos por un fallo.
- **Página siguiente con cursor inválido o vencido**: 400 `VALIDATION_ERROR` y la interfaz vuelve a la primera página.
- **Admin consultando un socio sin pagos**: lista vacía con el filtro aplicado visible.

## Sugerencia de pruebas funcionales

- `GET /payments` como `member` → solo pagos propios; intento de filtrar por otro `memberId` → sin datos ajenos.
- `GET /payments` como `admin` con filtro `status=FAILED` → solo fallidos.
- `GET /payments/{id}` de otro socio como `member` → 403/404.
- `GET /payments/{id}` inexistente → 404.
- Paginación: segunda página con `nextCursor`.
- Revisión de la respuesta: sin datos sensibles (P-08).
- Renderizado de estado vacío y de un pago "en verificación".

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-04, RN-PAG-08, RN-ADM-03.
- Casos de prueba: P-08 (superficie de respuesta); soporte de verificación para P-02, P-03, P-06.
- Depende de: US-021 (pagos registrados).
- Habilita: EP-07 (métricas de pagos del dashboard administrativo).
