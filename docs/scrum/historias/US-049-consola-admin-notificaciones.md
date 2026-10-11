# US-049 — Publicar y consultar notificaciones desde la consola de administración

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-049                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + Frontend                         |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 5                                          |
| Dependencias        | US-048                                     |

## Historia

Como **administrador**, quiero **redactar y publicar avisos desde la consola y ver el historial de lo que se envió**, para **comunicarme con los socios sin ayuda técnica y saber a cuántos llegó cada aviso**.

## Contrato de API

`POST /notifications` (US-048) y `GET /notifications/sent` (admin), según `docs/api/contratos-api.md` §8. Para elegir destinatario: `GET /members/lookup?dni=` (§4, ya permitido para `admin`) en el segmento `SINGLE` y `GET /resources` (§6) en `BY_RESOURCE`. Pantalla existente como placeholder: `/admin/notificaciones` (`NotificationsAdminPage`).

## Reglas de negocio

RN-ADM-06, RN-NOT-03, RN-ANL-08 (notificaciones enviadas). Modelo de datos: patrón de acceso 18 (`GSI2PK=NOTIFICATION#SENT`, rango `createdAt`).

## Valor de negocio

US-048 deja la capacidad en el servidor; esta historia la pone en manos del administrador, que es quien la usa. El historial le permite verificar qué se comunicó y a cuántos, y es la fuente de la métrica de notificaciones enviadas.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna adicional a las de US-048 al publicar; la consulta del historial es de solo lectura.

## Criterios de aceptación

1. `GET /notifications/sent` devuelve las notificaciones registradas, de la más reciente a la más antigua, paginadas por cursor, con título, segmento, origen (administrador o automática), evento si es automática, `recipientCount`, `alsoEmail` y fecha.
2. `GET /notifications/sent` con token `member` → 403.
3. En `/admin/notificaciones` el administrador completa título, cuerpo, segmento y la opción "enviar también por correo", con validación en el formulario coherente con `createNotificationSchema` (límites de longitud y campos condicionales).
4. Al elegir `SINGLE`, el administrador identifica al socio por DNI y ve su nombre antes de publicar; al elegir `BY_RESOURCE`, elige la instalación de una lista.
5. Antes de publicar se pide una confirmación explícita que resume el segmento elegido y si se enviará correo.
6. Tras publicar se muestra cuántos socios recibieron el aviso (`recipientCount`) y el aviso aparece al inicio del historial.
7. Los errores del contrato se muestran con su mensaje (`NOT_FOUND`, segmento sin destinatarios, `VALIDATION_ERROR`), sin perder lo escrito en el formulario.
8. El historial distingue visualmente los avisos publicados por un administrador de los automáticos. Filtrar por origen no está en el contrato y no se exige (ver pregunta abierta 13 de EP-05).
9. La pantalla es responsive, accesible y con estados de carga, error y vacío.

## Casos alternativos / excepciones

- **Vista previa de cuántos destinatarios tendrá un segmento antes de publicar**: no existe en el contrato; fuera de esta historia.
- **Ver la lista de destinatarios de un aviso enviado o quién lo leyó**: no está en el contrato ni en el Contexto Maestro; fuera de alcance.
- **Editar o retirar un aviso ya publicado**: fuera de alcance.

## Sugerencia de pruebas funcionales

- Publicación `ALL` desde la consola → el aviso aparece en la bandeja de un socio de prueba y en el historial con su `recipientCount`.
- `SINGLE` con DNI inexistente → el formulario informa que no se encontró el socio y no publica.
- N-12: el historial refleja lo enviado (base de la métrica RN-ANL-08).
- T-06: un `member` que navega a `/admin/notificaciones` es redirigido.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-ADM-06, RN-NOT-03, RN-ANL-08.
- Casos de prueba: N-04 a N-10 (por interfaz), N-12, T-06.
- Depende de: US-048.
- Habilita: US-057 (métrica de notificaciones enviadas).
