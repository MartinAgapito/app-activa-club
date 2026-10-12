# US-052 — Filtrar socios con deuda, vencidos o por vencer

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-052                                     |
| Épica               | [EP-06](../epicas/EP-06-administracion.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + Frontend                         |
| Fase                | MVP                                        |
| Sprint              | Sprint 5                                   |
| Estado              | Ready                                      |
| Prioridad           | Media                                      |
| Estimación relativa | 3                                          |
| Dependencias        | US-038, US-051                             |

## Historia

Como **administrador**, quiero **ver la lista de socios con deuda, con la membresía vencida o por vencer**, para **hacer seguimiento de la cobranza y anticiparme a las bajas**.

## Contrato de API

`GET /members?status=&membershipStatus=&cursor=&limit=` (admin), definido en la adenda del 2026-10-12 de `docs/api/contratos-api.md` §4 y §12, con la decisión de diseño en [ADR-0014](../../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md). Resumen:

- `membershipStatus` (`DEBT`, `EXPIRED`, `EXPIRING_SOON`, `ACTIVE`, `NONE`) es un filtro **adicional** a `status`, que sigue siendo obligatorio. La vista de cobranza envía `status=ACTIVE`.
- `DEBT` incluye a quien tenga `membershipStatus=DEBT` **o** `outstandingBalance > 0` (misma definición que el segmento `DEBT` de US-048).
- `MemberSummary` agrega `membershipEndsAt` y `outstandingBalance` en **todas** las respuestas de `GET /members` (también en US-051).
- Patrón de acceso #28 del modelo de datos: `Query` sobre la partición GSI2 del estado con `FilterExpression`; sin `Scan` ni índice nuevo. Paginación según §12.1 (hasta 5 lecturas internas por petición; solo `nextCursor: null` indica el final).
- Orden: fecha de alta del socio, ascendente (el del índice).

Ya no depende de US-048: la resolución por situación de membresía queda definida aquí (patrón #28) y US-048 puede reutilizarla para sus segmentos, no al revés.

## Reglas de negocio

RN-ADM-03 (consultar estados de membresía y deudas), RN-ANL-02 (membresías próximas a vencer).

## Valor de negocio

Es la vista de cobranza del club. Saber **quiénes** deben o están por vencer, y no solo cuántos (eso lo da el dashboard, US-057), es lo que permite actuar: llamar, enviar un aviso individual o segmentado.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- US-038 en producción (estados de membresía actualizados).

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Con `status=ACTIVE&membershipStatus=<valor>` el servidor devuelve, paginados por cursor, exactamente los socios `ACTIVE` en esa situación: `DEBT` (`membershipStatus=DEBT` o `outstandingBalance > 0`), `EXPIRED`, `EXPIRING_SOON`, `ACTIVE` o `NONE`. La combinación con otros `status` también filtra correctamente.
2. El orden es por fecha de alta ascendente con y sin filtro (decisión del Arquitecto en ADR-0014: ordenar por vencimiento o por saldo con paginación por cursor exigiría un índice nuevo, descartado por costo para el MVP).
3. `membershipStatus` fuera de los cinco valores, o `membershipStatus` sin `status` → 400 `VALIDATION_ERROR`; un token `member` → 403.
4. Cada elemento de `GET /members` (con y sin filtro) incluye `membershipEndsAt` (o `null`) y `outstandingBalance` en céntimos, y sigue sin incluir correo, teléfono, `cognitoSub`, `rejectionReason` ni `legacyId`.
5. Paginación con filtro: una partición con más coincidencias que `limit` devuelve exactamente `limit` elementos y un `nextCursor` con el que la página siguiente continúa **sin saltar ni repetir** socios; el servidor nunca hace más de 5 lecturas internas por petición; una página puede venir con menos de `limit` elementos (incluso vacía) y `nextCursor` no nulo.
6. En `/admin/socios` el administrador puede elegir "Con deuda", "Vencidos" o "Por vencer" además de los estados de socio de US-051, y ve nombre, DNI, fecha de vencimiento y saldo pendiente sin abrir el detalle de cada socio.
7. La pantalla pagina solo por `nextCursor` ("Cargar más" visible mientras exista cursor, aunque la última página haya llegado incompleta o vacía).
8. Desde cada fila se abre el detalle del socio (US-051).
9. Desde la lista filtrada, el administrador puede ir a publicar un aviso al segmento equivalente (US-049) con el segmento ya elegido.
10. La pantalla tiene estados de carga, error, vacío y paginación.

## Casos alternativos / excepciones

- **Socio migrado sin activar con deuda**: no aparece en la vista de cobranza (no tiene cuenta para pagar); aparece en el listado por estado `MIGRATED` de US-051 y también con `status=MIGRATED&membershipStatus=DEBT`. Ver pregunta abierta 3 de EP-06.
- **Socio vencido y con saldo**: aparece en "Con deuda" y en "Vencidos".
- **Exportar la lista** (Excel, PDF): fase posterior (matriz §7).

## Sugerencia de pruebas funcionales

- Socios preparados en cada situación → cada filtro devuelve exactamente los suyos.
- Socio `membershipStatus=ACTIVE` con `outstandingBalance > 0` → aparece en "Con deuda".
- Socio que paga su deuda → deja de aparecer en "Con deuda".
- Partición con 25 socios, 3 con deuda dispersos, `limit=2` → dos páginas con 2 y 1 elementos, sin repetidos.
- Filtro inválido → 400.

## Trazabilidad

- Épica: EP-06
- Reglas: RN-ADM-03, RN-ANL-02.
- Contrato: `docs/api/contratos-api.md` §4 y §12; modelo de datos patrón #28; ADR-0014.
- Casos de prueba: AD-02 (extensión); se propone a QA un caso nuevo por filtro y uno de paginación con página parcial.
- Depende de: US-038, US-051 (pantalla).
- Habilita: US-048 puede reutilizar el patrón #28 para los segmentos `DEBT`, `EXPIRED` y `EXPIRING_SOON`.

## Historial de cambios

- 2026-10-12: Contrato definido por el Arquitecto (adenda §4/§12, ADR-0014). Se agregan `ACTIVE` y `NONE` como valores del filtro, el enriquecimiento de `MemberSummary`, el orden por fecha de alta y la regla de paginación con filtro. Se retira la dependencia de US-048. Estado: Ready.
