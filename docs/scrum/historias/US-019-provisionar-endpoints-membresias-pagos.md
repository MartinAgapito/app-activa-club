# US-019 — Provisionar endpoints e infraestructura de membresías y pagos

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-019                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Tarea técnica                                |
| Responsable         | DevOps                                       |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Crítica                                      |
| Estimación relativa | 8                                            |
| Dependencias        | —                                            |

> **Nota (2026-08-09) — cambio de pasarela de pagos.** Esta historia se
> implementó originalmente con **Culqi sandbox** (ADR-0007). El proyecto migró a
> **Stripe (test mode)** porque Culqi exige RUC para emitir credenciales incluso
> de sandbox, requisito que este proyecto de tesis no puede cumplir. Ver
> [ADR-0011](../../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md)
> para la decisión y la nomenclatura vigente, y
> [US-037](./US-037-migrar-pasarela-culqi-a-stripe.md) para el trabajo de
> migración. Los parámetros SSM y la variable de build cambian de nombre (`/stripe/secret-key`, `/stripe/webhook-signing-secret`, `VITE_STRIPE_PUBLISHABLE_KEY`); los endpoints, alarmas y el principio de mínimo privilegio no cambian.
>
> El contenido siguiente **no se reescribe**: es el registro real de lo que se
> especificó e implementó en el Sprint 2.

## Objetivo

Provisionar en Terraform la infraestructura de endpoints serverless de membresías y pagos (API Gateway + Lambda por endpoint, log groups y alarmas), el resguardo del secreto de la llave privada de Culqi sandbox y la exposición de la llave pública al frontend, de modo que backend y frontend puedan integrar el flujo de pago contra el ambiente `dev` real.

## Entregable

Instanciación del módulo `modules/endpoint` (más `modules/log-group` y alarmas asociadas, ADR-0008) en `infrastructure/terraform/environments/dev/` para los endpoints de EP-03 definidos en `docs/api/contratos-api.md` §5 y §4, con el Cognito Authorizer cableado por rol y la ruta de webhook expuesta **sin** authorizer. No incluye la lógica de negocio de las Lambdas (la implementan US-021, US-024 y US-025).

## Endpoints en alcance de esta historia

- `GET /memberships/plans` (member, admin)
- `POST /payments` (member)
- `GET /payments` (member, admin)
- `GET /payments/{paymentId}` (member, admin)
- `POST /payments/webhook` (**público**, sin Cognito Authorizer; la verificación de firma la implementa US-024)
- `PATCH /members/me/auto-renew` (member) — contrato `docs/api/contratos-api.md` §4

## Valor de negocio

Sin endpoints desplegados, ninguna historia funcional de EP-03 puede integrarse ni demostrarse extremo a extremo, y el socio aprobado sigue sin poder activarse (RN-ACT-07). Esta historia desbloquea el trabajo paralelo de backend y frontend sobre `dev` y garantiza que la llave privada de Culqi viva como secreto gestionado y nunca en el repositorio (RN-PAG-08).

## Reglas de negocio

RN-PAG-04 (pagos vía Culqi sandbox), RN-PAG-08 (nunca datos de tarjeta ni secretos), ADR-0007 (separación cliente/servidor, idempotencia, webhook).

## Precondiciones

- La base de infraestructura de `dev` (DynamoDB, Cognito, API Gateway, CloudFront, SES) está desplegada y operativa (Sprint 0 y Sprint 1).
- Existe una cuenta de Culqi **sandbox** con su par de llaves (pública y privada) disponible para el ambiente `dev`.

## Postcondiciones

- Los endpoints de EP-03 existen en API Gateway con su autorización correcta y sus Lambdas asociadas (stub o real).
- La llave privada de Culqi está almacenada como secreto (SSM Parameter Store `SecureString` o Secrets Manager) y las Lambdas de pago pueden leerla con permiso de mínimo privilegio.
- El frontend recibe la llave **pública** de Culqi como variable de build.

## Criterios de aceptación

1. Cada endpoint listado en el alcance existe en API Gateway con su método, ruta y Lambda asociada, coherente con `docs/api/contratos-api.md`.
2. La autorización por endpoint respeta la columna "Auth" del contrato usando el Cognito Authorizer y el claim `cognito:groups` (ADR-0002); `POST /payments/webhook` queda accesible sin autenticación de Cognito.
3. La llave privada de Culqi se almacena como secreto gestionado por AWS y **no** figura en el repositorio, en variables de Terraform versionadas, ni en la definición de las Lambdas en texto plano; su valor se carga fuera del control de versiones.
4. Las Lambdas de pago (`POST /payments`, `POST /payments/webhook`) tienen permiso IAM de mínimo privilegio para leer únicamente ese secreto.
5. La llave **pública** de Culqi se expone al build del frontend como `VITE_CULQI_PUBLIC_KEY` en `deploy-dev.yml` (y se documenta en `.env.example` para desarrollo local); al ser pública, no se trata como secreto sensible pero sí como valor configurable por ambiente.
6. Cada Lambda tiene su log group y las alarmas previstas por ADR-0008.
7. El TTL de la tabla DynamoDB sobre el atributo `expiresAt` está activo y cubre los ítems `PaymentIdempotency` (modelo de datos §3.6).
8. La configuración se define exclusivamente en Terraform; no requiere cambios manuales en la consola AWS.
9. El despliegue se realiza mediante GitHub Actions con OIDC, sin claves AWS estáticas.
10. El plan/aplicación de Terraform se ejecuta sobre `environments/dev` sin romper los recursos ya desplegados.
11. La solución respeta el presupuesto AWS Free Tier (sin recursos innecesarios ni siempre-encendidos).
12. No se implementa lógica de negocio en esta historia; las Lambdas pueden entregar un stub temporal reemplazado por las historias de backend.
13. `docs/deployment/despliegue-dev.md` documenta cómo se carga la llave privada de Culqi en `dev` y cómo rotarla.

## Casos alternativos / excepciones

- Si el rol de despliegue de CI necesita un permiso nuevo (p. ej. `ssm:GetParameter`, `secretsmanager:*` o `kms:Decrypt`), debe aplicarse primero `infrastructure/terraform/bootstrap` con credenciales elevadas **antes** de mergear el PR, según el procedimiento ya documentado en `docs/deployment/despliegue-dev.md`; de lo contrario `deploy-dev.yml` falla con `AccessDenied`.
- Si el módulo `modules/endpoint` no soporta una ruta pública combinada con rutas autenticadas bajo el mismo prefijo (`/payments` vs `/payments/webhook`), se documenta el ajuste del módulo antes de aplicarlo.
- Si la cuenta de Culqi sandbox no está disponible al inicio del sprint, se provisiona el secreto con un valor placeholder para no bloquear el despliegue y se registra el cambio de valor como paso previo a la verificación extremo a extremo.

## Sugerencia de pruebas funcionales

- `terraform plan` sin cambios pendientes tras `apply` (idempotencia de la infraestructura).
- Llamada sin token a `POST /payments` → 401; con token de `member` → alcanza la Lambda.
- Llamada sin token a `POST /payments/webhook` → alcanza la Lambda (no 401).
- Llamada a `GET /payments` con token de `admin` → autorizada.
- Búsqueda de secretos en el repositorio: ninguna coincidencia de la llave privada.

## Trazabilidad

- Épica: EP-03
- Reglas: habilita RN-PAG-01..08, RN-ACT-07.
- Casos de prueba relacionados: P-08 (parcial, superficie de infraestructura).
- Depende de: — (base de EP-01/EP-02 desplegada).
- Habilita: US-020, US-021, US-024, US-025.
