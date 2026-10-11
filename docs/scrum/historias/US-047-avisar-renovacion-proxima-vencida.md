# US-047 — Avisar que la membresía está por vencer o ya venció

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-047                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Media                                      |
| Estimación relativa | 2                                          |
| Dependencias        | US-038, US-040                             |

## Historia

Como **socio**, quiero **recibir un aviso cuando mi membresía está por vencer y cuando ya venció**, para **renovarla a tiempo y no quedarme sin poder reservar**.

## Contrato de API

Sin endpoints nuevos. Efecto lateral de las transiciones de estado que realiza el proceso diario de US-038. Eventos `RENEWAL_DUE` (paso a `EXPIRING_SOON`) y `RENEWAL_OVERDUE` (paso a `EXPIRED`).

## Reglas de negocio

RN-NOT-04 (renovación próxima o vencida), RN-PAG-03 (la renovación automática es opcional y requiere autorización), RN-PAG-06 (con la membresía vencida no se puede reservar).

## Valor de negocio

Es el aviso con impacto económico más directo para el club: un socio que renueva antes de vencer no pierde días ni acceso a las instalaciones, y el club no pierde el ingreso.

## Precondiciones

- US-038 en producción: las transiciones de `membershipStatus` ocurren y dejan su rastro.
- US-040 disponible.

## Postcondiciones

- Cada transición a `EXPIRING_SOON` o a `EXPIRED` deja exactamente un aviso al socio.

## Criterios de aceptación

1. Cuando US-038 cambia a un socio a `EXPIRING_SOON`, se emite `RENEWAL_DUE` con la fecha de vencimiento y los días restantes, y una invitación a renovar desde la sección de membresía.
2. Cuando US-038 cambia a un socio a `EXPIRED`, se emite `RENEWAL_OVERDUE` indicando que no podrá reservar hasta renovar (RN-PAG-06) y que sí puede iniciar sesión y pagar.
3. Cada transición emite un solo aviso, aunque el proceso se ejecute dos veces el mismo día (se apoya en la idempotencia de US-038 y de US-040).
4. Un socio con `autoRenew=true` recibe los mismos avisos y el texto **no** le promete un cobro automático: ese cobro no existe en el sistema (ver decisión pendiente de EP-03).
5. Los socios sin cuenta digital (`memberStatus=MIGRATED`) no reciben avisos, aunque su estado de membresía se recalcule.
6. Un socio que renueva antes de vencer no recibe `RENEWAL_OVERDUE`.
7. Un fallo de correo o de bandeja no interrumpe el proceso diario para el resto de los socios.

## Casos alternativos / excepciones

- **Socio que queda `EXPIRING_SOON` y vence sin renovar**: recibe los dos avisos, en días distintos.
- **Socio con membresía que vence en menos de 7 días al momento de pagar** (renovación de un mes cuando ya estaba por vencer): la vigencia nueva lo saca del umbral y no recibe aviso.
- **Recordatorios repetidos** (todos los días mientras siga por vencer): fuera de esta historia; un aviso por transición.

## Sugerencia de pruebas funcionales

- DA-02 (parte de aviso): socio que pasa a `EXPIRING_SOON` → `RENEWAL_DUE` en su bandeja.
- Socio que pasa a `EXPIRED` → `RENEWAL_OVERDUE`.
- Socio con `autoRenew=true` → texto sin promesa de cobro automático.
- Socio `MIGRATED` → sin aviso.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-04, RN-PAG-03, RN-PAG-06.
- Casos de prueba: N-11 (eventos de renovación), DA-02.
- Depende de: US-038, US-040.
- Habilita: —
