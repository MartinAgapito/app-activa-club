# Sprint 2 — Membresías y pagos

| Campo             | Valor                                        |
| ----------------- | -------------------------------------------- |
| Sprint            | 2                                            |
| Nombre            | Membresías y pagos                           |
| Épica             | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Fase              | MVP                                          |
| Duración sugerida | 2 semanas                                    |
| Estado            | Planificado                                  |

> **Nota posterior al cierre (2026-08-09) — cambio de pasarela de pagos.** Este
> sprint se planificó y ejecutó contra **Culqi sandbox** (ADR-0007), y su
> contenido **no se reescribe**: es el registro real de lo que se decidió y se
> entregó. Después de su cierre se confirmó que Culqi exige RUC para emitir
> credenciales incluso de sandbox, algo que este proyecto de tesis no puede
> cumplir, por lo que el Product Owner decidió migrar a **Stripe (test mode)**
> ([ADR-0011](../../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md)).
> El trabajo de migración es
> [US-037](../historias/US-037-migrar-pasarela-culqi-a-stripe.md), planificada
> en el [Sprint 3](./sprint-3.md) como deuda técnica de EP-03. En consecuencia,
> la "Definición de éxito" de más abajo **quedó parcialmente sin verificar**: el
> cargo real nunca se ejecutó (el cliente de Culqi quedó como stub), así que
> RN-ACT-07 y el caso A-15 siguen abiertos hasta que US-037 se despliegue.

## Sprint Goal

Cerrar el vacío que dejó el Sprint 1 (RN-ACT-07: un socio aprobado no puede operar hasta pagar): permitir que un socio consulte los planes de membresía, pague con tarjeta vía **Culqi sandbox** y quede **activo** con su vigencia correcta, que pueda renovar o regularizar su deuda autorizando explícitamente —o no— la renovación automática, y que ese pago sea **idempotente, confirmado de forma segura y consultable**, sin que ningún dato de tarjeta ni secreto de Culqi toque el backend, la base de datos o los logs.

## Alcance del sprint

Este sprint implementa exclusivamente lo clasificado como **MVP** en la sección 3 (Membresías y pagos) de `docs/product/matriz-de-alcance.md`, sobre los contratos ya definidos en `docs/api/contratos-api.md` §5 (y `PATCH /members/me/auto-renew` de §4) y la decisión [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md). **No se define ningún contrato nuevo.**

**Fuera de este sprint:**

- Pagos en efectivo, Yape, Plin, transferencias, pagos manuales de administrador y facturación electrónica (fuera de alcance, matriz §3).
- El **bloqueo efectivo de reservas** para socio con deuda o vencido (`POST /reservations` → `MEMBER_HAS_DEBT`): EP-04. Este sprint entrega el estado correcto sobre el que EP-04 decidirá; el caso P-10 se cierra allí.
- El **módulo de notificaciones** (`PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` por correo y bandeja interna): EP-05. Aquí solo se deja el rastro previsto por el contrato (caso P-11).
- Las **métricas de pagos** del dashboard administrativo: EP-07.
- La **ejecución automática desatendida** del cargo recurrente (ver "Decisión funcional pendiente" más abajo).

## Sprint Backlog

| ID                                                                      | Título                                                          | Responsable        | Prioridad | Depende de     | Estimación |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ | --------- | -------------- | ---------- |
| [US-019](../historias/US-019-provisionar-endpoints-membresias-pagos.md) | Provisionar endpoints e infraestructura de membresías y pagos   | DevOps             | Crítica   | —              | 8          |
| [US-020](../historias/US-020-consultar-planes-membresia.md)             | Consultar los planes de membresía disponibles                   | Backend + Frontend | Alta      | US-019         | 3          |
| [US-021](../historias/US-021-cobro-membresia-idempotente-culqi.md)      | Cobrar la membresía con Culqi de forma idempotente y confirmada | Backend            | Crítica   | US-019         | 8          |
| [US-022](../historias/US-022-checkout-pago-membresia.md)                | Pagar la membresía desde la plataforma (checkout)               | Frontend           | Crítica   | US-020, US-021 | 5          |
| [US-023](../historias/US-023-renovacion-membresia-autorenovacion.md)    | Renovar la membresía y autorizar la renovación automática       | Backend + Frontend | Alta      | US-021, US-022 | 5          |
| [US-024](../historias/US-024-webhook-confirmacion-culqi.md)             | Confirmar pagos mediante el webhook de Culqi                    | Backend            | Alta      | US-019, US-021 | 5          |
| [US-025](../historias/US-025-historial-pagos.md)                        | Consultar el historial de pagos (socio y administrador)         | Backend + Frontend | Media     | US-021         | 5          |
| [US-026](../historias/US-026-manejo-seguro-datos-pago.md)               | Garantizar el manejo seguro de los datos de pago                | Backend + DevOps   | Alta      | US-021, US-024 | 3          |

Estimación total: 42 puntos relativos (Sprint 1 cerró con 45).

## Grafo de dependencias

```
(Sprint 1 cerrado: socios APPROVED/ACTIVE, GET /members/me, guard RequireActiveMember)
   └──► US-019 ──┬──► US-020 ──┐
                 │             ├──► US-022 ──► US-023
                 ├──► US-021 ──┤
                 │             ├──► US-024 ──┐
                 │             └──► US-025   ├──► US-026
                 └────────────────────────────┘
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (arranque, en paralelo):** US-019 (DevOps: endpoints, secreto de Culqi, llave pública al build). En paralelo, Frontend prepara la pantalla de planes y el esqueleto del checkout contra el contrato (US-020/US-022 con datos simulados), y Backend prepara el dominio de pago y el cálculo de vigencia con pruebas unitarias sin depender del despliegue.
- **Ola 2 (tras US-019):** US-021 (Backend: cargo idempotente y confirmación) y US-020 integrado extremo a extremo.
- **Ola 3:** US-022 (checkout real contra `POST /payments`), US-024 (webhook) y US-025 (historial), los tres en paralelo.
- **Ola 4:** US-023 (renovación y autorización de renovación automática) sobre el checkout ya funcionando.
- **Ola 5 (verificación extremo a extremo):** US-026 (evidencia de manejo seguro de datos de pago) + demo del flujo completo: registro → aprobación → **pago** → socio `ACTIVE` en el área de socio, y socio con deuda → pago → regularizado.

## Capacidad de trabajo paralelo

- El contrato `docs/api/contratos-api.md` §5 ya existe desde el Sprint 0: Frontend y Backend pueden desarrollar en paralelo desde el día 1 sin esperar al otro.
- La separación de US-021 (servidor) y US-022 (experiencia de pago) es deliberada: permite que el cobro idempotente y el checkout avancen a la vez y que ninguna de las dos historias sea demasiado grande para el sprint.
- US-024 (webhook) y US-025 (historial) solo dependen de que exista la entidad `Payment`, no del checkout; pueden cerrarse antes que la interfaz.
- DevOps desbloquea todo con US-019; si la cuenta de Culqi sandbox demora, el secreto se provisiona con un placeholder para no frenar el despliegue.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- Un socio nuevo puede completar el recorrido entero en `dev`: registro → aprobación administrativa → **pago de la primera membresía** → `memberStatus=ACTIVE` → acceso al área de socio (cierra RN-ACT-07 y el caso A-15 de la matriz de trazabilidad).
- Un socio con membresía vencida o con deuda puede iniciar sesión, pagar y quedar regularizado (RN-PAG-06).
- La misma `idempotencyKey` nunca genera dos cargos; el webhook y la respuesta síncrona convergen al mismo estado.
- La renovación automática solo queda activa con autorización explícita del socio y puede revocarse.
- Socio y administrador pueden consultar el historial de pagos con las restricciones de visibilidad correctas.
- No existe PAN, CVV ni secreto de Culqi en request, respuesta, log, DynamoDB ni repositorio, con evidencia adjunta (US-026).
- Los casos P-01..P-09 y P-12 de `docs/testing/matriz-trazabilidad.md` §3 quedan cubiertos; P-10 (bloqueo de reserva) queda para EP-04 y P-11 (notificaciones) para EP-05, ambos documentados como tales.
- No se introdujo alcance fuera del MVP de la sección 3 de la matriz de alcance.

## Ceremonias

- **Planning:** selección de US-019..US-026, confirmación del Sprint Goal y **resolución de la decisión funcional pendiente** sobre la ejecución automática de la renovación (ver abajo).
- **Daily:** foco en desbloquear la cadena US-019 → US-021 → US-022 y en la convergencia de las dos rutas de confirmación (síncrona y webhook).
- **Review:** demostración extremo a extremo en `dev` del flujo registro → aprobación → pago → socio activo, más pago fallido, pago duplicado e historial.
- **Retrospective:** ajustes de proceso antes de EP-04 (reservas), en particular sobre la coordinación con el paso manual de `bootstrap` cuando cambian los permisos del rol de despliegue.

## Decisión funcional pendiente (resolver en Planning)

La matriz de alcance §3 clasifica como MVP la "renovación automática opcional con autorización explícita (opt-in del socio)". Los contratos vigentes cubren la **autorización** (`PATCH /members/me/auto-renew`, `autoRenew` en `POST /payments`), pero **no** la ejecución de un cargo recurrente desatendido (tarjeta en archivo + planificador), que no está contemplada en ADR-0007. US-023 entrega la autorización, su revocación y su visibilidad.

Propuesta del Product Analyst: mantener en el Sprint 2 la autorización explícita y **no** comprometer el cobro desatendido hasta que el Arquitecto decida (ADR complementario) si Culqi sandbox permite cargos recurrentes con token guardado sin violar RN-PAG-08. Cualquier decisión distinta debe registrarse en la matriz de alcance antes de ampliar el Sprint Backlog. Mientras tanto, la interfaz no debe prometer un cobro automático que el sistema todavía no ejecuta (criterio 12 de US-023).

## Notas para DevOps (US-019)

- **Secreto de Culqi**: la llave **privada** y el secreto de verificación de firma del webhook deben vivir en SSM Parameter Store (`SecureString`) o Secrets Manager; nunca en el repositorio ni en variables de Terraform versionadas.
- **Permisos del rol de CI**: si el rol de despliegue necesita servicios nuevos (`ssm:GetParameter`, `secretsmanager:*`, `kms:Decrypt`), hay que aplicar `infrastructure/terraform/bootstrap` con credenciales elevadas **antes** de mergear el PR; ya pasó varias veces (ver `docs/deployment/despliegue-dev.md`). Planificarlo como paso previo, no como sorpresa a mitad de sprint.
- **Build del frontend**: agregar `VITE_CULQI_PUBLIC_KEY` a `deploy-dev.yml` (junto a `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) y documentarla en `.env.example`. Es una llave pública: se configura por ambiente, pero no requiere tratamiento de secreto.
- **Ruta pública bajo prefijo autenticado**: `POST /payments/webhook` va sin Cognito Authorizer mientras `/payments` sí lo lleva; verificar que el módulo `modules/endpoint` lo soporte antes de la Ola 2.
- **TTL de DynamoDB**: ya está configurado sobre el atributo `expiresAt` en `modules/dynamodb-table`; confirmar que cubre los ítems `PaymentIdempotency` y que la ventana elegida supera cualquier reintento razonable.
- **CORS y redespliegue del stage**: recordar los bugs de transporte del Sprint 1 (CORS entre dominios y stage de API Gateway sin redesplegar al cambiar la topología de rutas). Al agregar seis rutas nuevas, verificarlo explícitamente antes de dar por buena la integración.

## Riesgos del sprint

| Riesgo                                                                     | Impacto                                                               | Mitigación                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retraso de US-019 (endpoints + secreto de Culqi)                           | Alto: bloquea US-020, US-021, US-024, US-025                          | Priorizar US-019 en Ola 1; usar stubs de Lambda y datos simulados en el frontend para avanzar en paralelo; provisionar el secreto con placeholder si hace falta |
| Permiso faltante del rol de CI para leer el secreto                        | Alto: `deploy-dev.yml` falla con `AccessDenied` a mitad de sprint     | Aplicar `bootstrap` con credenciales elevadas **antes** de mergear el PR de US-019 (procedimiento ya documentado)                                               |
| Doble cargo por reintento o doble clic                                     | Alto: dinero real del socio, pérdida de confianza                     | Idempotencia obligatoria (ADR-0007) con condición `attribute_not_exists`; prueba explícita P-04 en dos niveles (API y UI)                                       |
| Pago cobrado que no se refleja en el estado del socio                      | Alto: socio pagó y sigue bloqueado                                    | Estado `PENDING_CONFIRMATION` + webhook idempotente (US-024) + alarma sobre errores de procesamiento; nunca activar sin confirmación (RN-PAG-07)                |
| Fuga de datos sensibles (PAN/CVV/secretos) en logs, DynamoDB o repositorio | Muy alto: riesgo irreversible y observación directa en la defensa     | US-026 como verificación consolidada con evidencia; campos prohibidos en el logger; tokenización solo en el cliente                                             |
| Endpoint público de webhook expuesto a abuso                               | Medio-Alto: escritura no autorizada de estados                        | Verificación de firma antes de cualquier efecto (P-07); nada se procesa sin firma válida; registro de intentos rechazados                                       |
| Ambigüedad de la renovación automática (opt-in vs. cobro desatendido)      | Medio: promesa en la interfaz que el sistema no cumple, o scope creep | Resolver en Planning; US-023 acotada a la autorización explícita; texto de interfaz alineado a la capacidad real                                                |
| Diferencias entre Culqi sandbox y producción (facilidades de pago anual)   | Medio: RN-PAG-02 no demostrable                                       | `allowsInstallments` refleja la capacidad realmente disponible; la matriz ya lo condiciona a "sujeto a la integración disponible" (P-12)                        |
| Regresión de la capa de transporte al agregar rutas (CORS / stage)         | Medio: integración rota como en el Sprint 1                           | Verificación explícita de CORS y redespliegue del stage en la Ola 2, antes de integrar el checkout                                                              |
| Costos fuera de Free Tier al agregar Lambdas y alarmas                     | Bajo: presupuesto                                                     | Dimensionar mínimo, sin recursos siempre encendidos; revisar en el plan de Terraform                                                                            |

## Historial de cambios

- 2026-08-09: Creación del Sprint 2 con las 8 historias de EP-03 (US-019..US-026).
