# US-052 — Filtrar socios con deuda, vencidos o por vencer

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-052                                     |
| Épica               | [EP-06](../epicas/EP-06-administracion.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + Frontend                         |
| Fase                | MVP                                        |
| Sprint              | Sprint 5                                   |
| Prioridad           | Media                                      |
| Estimación relativa | 3                                          |
| Dependencias        | US-038, US-048, US-051                     |

## Historia

Como **administrador**, quiero **ver la lista de socios con deuda, con la membresía vencida o por vencer**, para **hacer seguimiento de la cobranza y anticiparme a las bajas**.

## Contrato de API

**Requiere una extensión de contrato antes de implementar** (DoR, punto 12): hoy `GET /members` solo filtra por `memberStatus`. Propuesta para que el Arquitecto la documente en `docs/api/contratos-api.md` §4: un filtro adicional `membershipStatus` (`DEBT`, `EXPIRED`, `EXPIRING_SOON`) en el mismo endpoint, con la misma forma de respuesta y la misma paginación. El servidor reutiliza la resolución de socios por situación de membresía construida para los segmentos de US-048, sin un `Scan` completo de la tabla.

## Reglas de negocio

RN-ADM-03 (consultar estados de membresía y deudas), RN-ANL-02 (membresías próximas a vencer).

## Valor de negocio

Es la vista de cobranza del club. Saber **quiénes** deben o están por vencer, y no solo cuántos (eso lo da el dashboard, US-057), es lo que permite actuar: llamar, enviar un aviso individual o segmentado.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- US-038 en producción (estados de membresía actualizados) y contrato extendido por el Arquitecto.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. El servidor devuelve, paginados por cursor, los socios con `memberStatus=ACTIVE` en la situación pedida: `DEBT` (incluye saldo pendiente mayor que cero), `EXPIRED` o `EXPIRING_SOON`, con los mismos criterios que los segmentos de US-048.
2. La lista de `EXPIRING_SOON` se ordena por fecha de vencimiento, la más próxima primero; la de `DEBT`, por saldo pendiente, el mayor primero, si el patrón de acceso lo permite (si no, el Arquitecto documenta el orden disponible).
3. Un valor de filtro fuera de los tres admitidos → 400 `VALIDATION_ERROR`; un token `member` → 403.
4. En `/admin/socios` el administrador puede elegir "Con deuda", "Vencidos" o "Por vencer" además de los estados de socio de US-051, y ve nombre, DNI, fecha de vencimiento y saldo pendiente.
5. Desde cada fila se abre el detalle del socio (US-051).
6. Desde la lista filtrada, el administrador puede ir a publicar un aviso al segmento equivalente (US-049) con el segmento ya elegido.
7. La pantalla tiene estados de carga, error, vacío y paginación.

## Casos alternativos / excepciones

- **Socio migrado sin activar con deuda**: no aparece en la vista de cobranza (no tiene cuenta para pagar); aparece en el listado por estado `MIGRATED` de US-051. Ver pregunta abierta 3 de EP-06.
- **Exportar la lista** (Excel, PDF): fase posterior (matriz §7).

## Sugerencia de pruebas funcionales

- Socios preparados en cada situación → cada filtro devuelve exactamente los suyos.
- Socio que paga su deuda → deja de aparecer en "Con deuda".
- Filtro inválido → 400.

## Trazabilidad

- Épica: EP-06
- Reglas: RN-ADM-03, RN-ANL-02.
- Casos de prueba: AD-02 (extensión); se propone a QA un caso nuevo por filtro.
- Depende de: US-038, US-048 (resolución por situación de membresía), US-051 (pantalla).
- Habilita: —
