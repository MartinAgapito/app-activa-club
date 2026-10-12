# US-039 — Provisionar endpoints e infraestructura de notificaciones

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-039                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Tarea técnica                              |
| Responsable         | DevOps                                     |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Crítica                                    |
| Estimación relativa | 5                                          |
| Dependencias        | —                                          |

## Objetivo

Provisionar en Terraform los cuatro endpoints serverless de notificaciones y el permiso de envío de correo por Amazon SES para las Lambdas que emiten eventos, de modo que backend y frontend puedan integrar el módulo de notificaciones contra el ambiente `dev` real desde el primer día del sprint.

## Entregable

Instanciación del módulo `modules/endpoint` (con su log group y alarmas, [ADR-0008](../../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)) en `infrastructure/terraform/environments/dev/` para los endpoints de `docs/api/contratos-api.md` §8, y el permiso `ses:SendEmail` acotado a la identidad de remitente que ya existe (`modules/ses-identity`, [ADR-0006](../../architecture/adr/ADR-0006-ses-correos-transaccionales.md)). No incluye lógica de negocio (la implementan US-040, US-041, US-048 y US-049) ni las plantillas de correo (US-040) ni los procesos programados (US-046, US-047).

## Endpoints en alcance de esta historia

- `GET /notifications` (member)
- `POST /notifications/{notificationId}/read` (member)
- `POST /notifications` (admin)
- `GET /notifications/sent` (admin)

## Lambdas existentes que reciben permisos nuevos

Las que emiten eventos automáticos (US-042 a US-045): `activation-complete`, `members-approve`, `members-reject`, `payments-create`, `payments-webhook`, `reservations-create`, `reservations-cancel`, `reservations-approve`, `reservations-reject`, `resources-maintenance-create` y `resources-update`. Cada una necesita escribir la notificación interna en la tabla y `ses:SendEmail` sobre la identidad del remitente.

## Valor de negocio

Las notificaciones son obligatorias en el MVP (RN-NOT-01) y llevan tres sprints acumulando eventos pendientes. Sin endpoints desplegados ni permiso de correo, ninguna historia de EP-05 puede demostrarse en `dev`.

## Reglas de negocio

Habilita RN-NOT-01..04 y RN-ADM-06. Autorización por rol según [ADR-0002](../../architecture/adr/ADR-0002-autenticacion-cognito-roles.md).

## Precondiciones

- La identidad de remitente SES de `dev` existe y está verificada (Sprint 0).
- La base de infraestructura de `dev` está desplegada (Sprints 0 a 3).

## Postcondiciones

- Los cuatro endpoints existen en API Gateway con su autorización por rol y su Lambda.
- Las Lambdas que emiten eventos pueden escribir notificaciones y enviar correo, sin ningún otro permiso adicional.

## Criterios de aceptación

1. Los cuatro endpoints existen en API Gateway con método, ruta y Lambda coherentes con `docs/api/contratos-api.md` §8.
2. `POST /notifications` y `GET /notifications/sent` no son alcanzables con un token `member` (403); `GET /notifications` y `POST /notifications/{id}/read` no son alcanzables con un token `admin` (403), según la columna "Auth" del contrato.
3. Ningún endpoint de notificaciones es público.
4. La ruta `notifications/sent` (segmento estático) y `notifications/{notificationId}/read` (parámetro) no colisionan entre sí.
5. Cada Lambda nueva tiene permisos de mínimo privilegio sobre la tabla y solo sobre los índices que consulta (GSI2 para `GET /notifications/sent` y para la resolución de segmentos de `POST /notifications`).
6. `ses:SendEmail` se concede solo a las Lambdas que envían correo y solo sobre el ARN de la identidad de remitente del ambiente; ninguna Lambda recibe `ses:*`.
7. `POST /notifications` tiene un tiempo máximo de ejecución suficiente para un envío segmentado al padrón mock completo, documentado en el PR.
8. Cada Lambda nueva tiene log group con retención y las alarmas previstas por ADR-0008.
9. Todo se define en Terraform y se despliega por GitHub Actions con OIDC; no hay cambios manuales en la consola.
10. `terraform plan` no recrea recursos de EP-01 a EP-04; tras agregar las rutas el stage queda redesplegado y CloudFront sigue sirviendo el SPA y `/api/*`.
11. Sin recursos siempre encendidos; dentro de la capa gratuita.
12. No se implementa lógica de negocio: las Lambdas nuevas pueden quedar con el placeholder hasta que las reemplacen sus historias.

## Casos alternativos / excepciones

- Si el rol de despliegue de CI necesita permisos nuevos sobre SES, se aplica `bootstrap` con credenciales elevadas **antes** de mergear, según `docs/deployment/despliegue-dev.md`.
- **SES en sandbox**: solo entrega a direcciones verificadas. Es suficiente para la demo; salir del sandbox queda fuera del alcance (ADR-0006). El PR debe dejar documentado cómo verificar un destinatario de prueba.

## Historial de cambios

- 2026-10-12: Infraestructura desplegada en `dev` por Terraform (PR de US-039), pendiente lógica: los cuatro endpoints responden 501 con el placeholder hasta US-041, US-048 y US-049; las 11 Lambdas emisoras tienen `ses:SendEmail` sobre la identidad remitente. Detalle y permisos por Lambda en `docs/deployment/terraform-infraestructura.md` sección 11. Verificación en `dev` tras el despliegue.

## Sugerencia de pruebas funcionales

- `terraform plan` sin cambios tras `apply`.
- Sin token → 401 en los cuatro endpoints.
- Token `member` a `POST /notifications` → 403; token `admin` a `GET /notifications` → 403.
- `GET /notifications/sent` con token `admin` alcanza su Lambda y no la de `read`.

## Trazabilidad

- Épica: EP-05
- Reglas: habilita RN-NOT-01..04, RN-ADM-06.
- Casos de prueba: AD-06 (superficie de autorización); N-01..N-12 habilitados, no cubiertos aquí.
- Depende de: — (base desplegada de EP-01 a EP-04).
- Habilita: US-040, US-041, US-048, US-049.
