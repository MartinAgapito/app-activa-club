# US-042 — Notificar la activación de cuenta y la decisión sobre una solicitud

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-042                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 2                                          |
| Dependencias        | US-040                                     |

## Historia

Como **socio**, quiero **recibir un aviso cuando activo mi cuenta y cuando el club aprueba o rechaza mi solicitud de alta**, para **saber en qué estado estoy y qué tengo que hacer a continuación sin tener que entrar a revisar**.

## Contrato de API

Sin endpoints nuevos. Efecto lateral de `POST /activation/complete` (§3, evento `ACCOUNT_ACTIVATED`), `POST /members/{memberId}/approve` (§4, `MEMBER_APPROVED`) y `POST /members/{memberId}/reject` (§4, `MEMBER_REJECTED`). Las respuestas de esos endpoints no cambian.

## Reglas de negocio

RN-NOT-04 (activación de cuenta, aprobación/rechazo de solicitud), RN-ACT-06, RN-ACT-07.

## Valor de negocio

Un socio nuevo que espera la aprobación no tiene hoy ninguna forma de enterarse de la decisión salvo volver a iniciar sesión. El aviso de aprobación además le dice el siguiente paso (pagar su primera membresía), que es lo que lo convierte en socio activo.

## Precondiciones

- US-040 disponible.

## Postcondiciones

- Cada una de las tres operaciones, al completarse con éxito, deja un aviso en la bandeja del socio afectado y le envía el correo correspondiente.

## Criterios de aceptación

1. Una activación completada con éxito emite `ACCOUNT_ACTIVATED` al socio activado, con un texto de bienvenida.
2. Una aprobación emite `MEMBER_APPROVED` al socio aprobado; el texto indica que debe pagar su primera membresía para quedar activo y poder reservar (RN-ACT-07).
3. Un rechazo emite `MEMBER_REJECTED` al socio rechazado, incluyendo el motivo registrado por el administrador.
4. Una operación que falla (DNI no encontrado, ya activado, solicitud que no estaba `PENDING`, etc.) no emite ningún aviso.
5. Un fallo de correo o de bandeja no cambia la respuesta de la operación de origen (US-040, criterios 5 y 7).
6. La aprobación o el rechazo concurrente por dos administradores (uno recibe 409) emite un solo aviso.
7. Ningún texto incluye datos de otro socio ni datos del administrador que decidió.

## Casos alternativos / excepciones

- **Socio `APPROVED` o `REJECTED`**: todavía no puede entrar al área de socio, así que el correo es el canal efectivo; la notificación interna igual se registra y la verá en su bandeja cuando quede activo (el aprobado) o nunca (el rechazado). Mostrar el aviso en la pantalla de "cuenta pendiente" sería alcance nuevo.
- **Socio migrado que activa con membresía vencida o con deuda**: recibe la bienvenida igual; la situación de su membresía se la muestra el dashboard (US-056).

## Sugerencia de pruebas funcionales

- A-07: activación exitosa → `ACCOUNT_ACTIVATED` en la bandeja del socio.
- A-12 / A-13: aprobación y rechazo → `MEMBER_APPROVED` / `MEMBER_REJECTED` con motivo.
- A-14: aprobar una solicitud que no está `PENDING` → 409 y ningún aviso.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-04, RN-ACT-06, RN-ACT-07.
- Casos de prueba: A-07; parte de notificación de A-12 y A-13.
- Depende de: US-040.
- Habilita: cierre de los eventos pendientes del Sprint 1.

## Historial de cambios

- 2026-10-12: Implementada en backend. `POST /activation/complete`, `POST /members/{memberId}/approve` y `POST /members/{memberId}/reject` emiten `ACCOUNT_ACTIVATED`, `MEMBER_APPROVED` y `MEMBER_REJECTED` (con motivo) tras la operación exitosa, mediante `safeEmitNotification` (el aviso nunca altera la respuesta). `entityId` = `memberId`; sin lecturas extra (se reutiliza el `Member` ya leído). Sin cambios de IAM: las tres Lambdas ya tenían `dynamodb:PutItem` y `ses:SendEmail` (US-039).
