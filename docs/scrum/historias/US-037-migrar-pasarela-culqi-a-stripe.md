# US-037 — Migrar la pasarela de pagos de Culqi a Stripe (test mode)

| Campo               | Valor                                                           |
| ------------------- | --------------------------------------------------------------- |
| ID                  | US-037                                                          |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md)                    |
| Tipo                | Deuda técnica / cambio de proveedor (tarea técnica transversal) |
| Responsable         | Backend + Frontend + DevOps (con QA)                            |
| Fase                | MVP                                                             |
| Sprint              | Sprint 3 (arrastre de EP-03; ver "Ubicación en el backlog")     |
| Prioridad           | Crítica                                                         |
| Estimación relativa | 8                                                               |
| Dependencias        | US-019, US-021, US-022, US-024, US-026 (ya implementadas)       |

## Contexto

El Sprint 2 entregó toda la superficie de pagos contra **Culqi sandbox**
(ADR-0007), pero el cargo real nunca llegó a ejecutarse: el secreto de SSM
quedó en placeholder y `apps/api/src/payments/culqi-client.ts` es un stub
(`notImplementedCulqiClient`) que falla explícitamente en vez de simular un
resultado. **Culqi exige RUC para emitir credenciales incluso de sandbox**, y
este proyecto de tesis no dispone de uno.

El Product Owner decidió migrar a **Stripe en test mode**, que entrega
`pk_test_`/`sk_test_` sin activar la cuenta ni presentar datos de negocio. La
decisión, el flujo completo y la **nomenclatura vinculante** están en
[ADR-0011](../../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md).

Esta historia es **el trabajo de migración**, no un rediseño: el alcance
funcional, las rutas, los códigos de error y las reglas de negocio son los
mismos. Nadie debe inventar nombres aquí: **todos** están fijados en
ADR-0011 §D8.

## Objetivo

Que el módulo de pagos funcione de punta a punta contra la API real de Stripe
en test mode, con las mismas garantías de seguridad e idempotencia que exigían
RN-PAG-07 y RN-PAG-08, y sin que quede ninguna referencia funcional a Culqi en
el código, la infraestructura o la configuración.

## Valor de negocio

Hoy **ningún socio puede volverse `ACTIVE` pagando**: RN-ACT-07 sigue abierto,
el caso A-15 sigue pendiente y el Sprint 3 arranca sin cumplir su propia
precondición ("Sprint 2 cerrado: socios `ACTIVE` al día"). Esta historia
convierte el módulo de pagos de "implementado pero no verificable" en
"funcionando y demostrable en vivo", que es exactamente lo que un jurado va a
pedir ver de un módulo de pagos.

## Reglas de negocio

RN-PAG-01, **RN-PAG-04** (pagos digitales con tarjeta vía Stripe test mode —
actualizada por este pivote), RN-PAG-05, RN-PAG-06, RN-PAG-07 (confirmación
segura), **RN-PAG-08** (nunca datos de tarjeta ni secretos de Stripe),
RN-ACT-07. Riesgos: RT-01 (doble cobro), RT-05 (filtrado de secretos), RT-06
(datos prohibidos), RT-14 (webhook falsificado).
Decisión: [ADR-0011](../../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md),
que reemplaza a [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).

## Precondiciones

- Existe una cuenta Stripe en **test mode** con su par `pk_test_`/`sk_test_`
  (sin activación, sin RUC).
- Está registrado el endpoint de webhook en el dashboard de Stripe (test mode)
  suscrito a `payment_intent.succeeded` y `payment_intent.payment_failed`, y se
  obtuvo su **signing secret** (`whsec_...`).
- Las validaciones de ADR-0011 ("Validaciones requeridas antes de implementar")
  están hechas, en particular que la cuenta acepta `currency: 'pen'` y que el
  monto del plan mensual supera el mínimo aplicable.

## Postcondiciones

- Un socio `APPROVED` paga con la tarjeta de prueba de Stripe y queda `ACTIVE`
  con su `membershipEndsAt` correcto, en el ambiente `dev` real.
- No queda ninguna referencia funcional a Culqi en `apps/`, `packages/`,
  `infrastructure/` ni `.github/` (solo referencias históricas en la
  documentación: ADR-0007, notas de US-021/022/024/026 y este documento).

## Criterios de aceptación

### Contratos compartidos

1. `packages/shared-types/src/payment.ts`: `CreatePaymentRequest.culqiToken` →
   **`stripePaymentMethodId`**; `Payment.culqiChargeId` y
   `PaymentSummary.culqiChargeId` → **`stripePaymentIntentId`** (sigue
   nullable). Ningún tipo expone datos de tarjeta.
2. `packages/validation/src/payment.ts`: `createPaymentSchema` valida
   `stripePaymentMethodId` (string no vacío) y **conserva `.strict()`**, de modo
   que `cardNumber`/`cvv`/`expirationDate` sigan devolviendo 400
   `VALIDATION_ERROR` (criterio 1 de US-026, no puede regresar).

### Backend

3. `apps/api/src/payments/culqi-client.ts` se renombra a **`stripe-client.ts`**
   y expone exactamente los tipos de ADR-0011 §D8: `StripeChargeInput` (con
   `stripePaymentMethodId`, `amount`, `currency`, `reference`, **`idempotencyKey`**),
   `StripeChargeOutcome` (`APPROVED` con `stripePaymentIntentId` | `DECLINED` |
   `AMBIGUOUS`) y `StripeChargeClient`.
4. Se implementa **`createStripeChargeClient`** con el paquete oficial
   **`stripe`** de Node.js (no `fetch` manual), creando el PaymentIntent con los
   parámetros de ADR-0011 §D3 (`confirm: true`,
   `automatic_payment_methods.allow_redirects = 'never'`,
   `metadata: { paymentId }`) y pasando la `idempotencyKey` como
   **`Idempotency-Key` nativo** de Stripe. El stub
   `notImplementedCulqiClient` desaparece.
5. `apps/api/src/payments/charge.ts` pasa `input.request.idempotencyKey` al
   cliente de cargos y persiste `stripePaymentIntentId`. Se mantiene la política
   vigente: cualquier excepción no reconocida se normaliza a `AMBIGUOUS` →
   `PENDING_CONFIRMATION` (un pago intentado nunca se pierde sin rastro).
6. El rechazo de tarjeta se detecta correctamente: con `confirm: true` el SDK
   **lanza** `StripeCardError` en vez de devolver un estado de fallo; el
   handler lo captura por `error.type` y mapea a `DECLINED` → 402/422
   `PAYMENT_FAILED`, según la tabla de ADR-0011 §D5.
7. `failureReason` proviene de un **catálogo propio** mapeado desde
   `error.code`/`decline_code`; no se propaga ni se registra el mensaje crudo
   del proveedor (criterio 5 de US-026).
8. El webhook verifica la firma con **`stripe.webhooks.constructEvent`** sobre
   el **cuerpo crudo** (`event.body` sin parsear, decodificado si
   `isBase64Encoded`), usando el signing secret; se elimina la verificación
   HMAC propia (`webhook-signature.ts`). Firma inválida, ausente o fuera de
   tolerancia → 401 `UNAUTHENTICATED` sin ningún efecto.
9. El esquema de evento (`webhook-event-schema.ts`) acepta la forma de Stripe:
   `type` ∈ {`payment_intent.succeeded`, `payment_intent.payment_failed`},
   correlación por **`data.object.metadata.paymentId`**. Cualquier otro tipo de
   evento se responde 202 sin efectos y se registra.
10. Se preservan sin regresión: idempotencia con ítem `PaymentIdempotency`
    (`attribute_not_exists` + TTL), 409 `PAYMENT_DUPLICATE` con el resultado
    previo, convergencia idempotente entre ruta síncrona y webhook, y el
    cálculo de vigencia (primer pago vs. renovación encadenada) de US-021.
11. La lista de campos prohibidos del logger (`apps/api/src/lib/logger.ts`)
    **suma** `stripePaymentMethodId`, `stripeSecretKey` y `client_secret` (y
    conserva los actuales); ningún log incluye el cuerpo crudo de la petición ni
    de la respuesta del proveedor.

### Frontend

12. `apps/web/src/payments/culqi.ts` se reemplaza por **`stripe.ts`** con
    `@stripe/stripe-js` + `@stripe/react-stripe-js`, exponiendo
    **`createStripePaymentMethod`** y el error **`StripePaymentError`**. El
    script de Stripe se carga desde el dominio de Stripe (requisito PCI-DSS
    SAQ A), nunca autoalojado.
13. `CheckoutPage` monta el **Payment Element** (o Card Element) y envía a
    `POST /payments` únicamente `membershipType`, `stripePaymentMethodId`,
    `idempotencyKey` y, si corresponde, `autoRenew`. Ningún dato de tarjeta
    entra al DOM propio, al estado de React, a `localStorage`/`sessionStorage`
    ni a telemetría (RN-PAG-08).
14. Se conserva el comportamiento ya validado en US-022: `idempotencyKey`
    generada una vez por intento y reutilizada en reintentos; botón
    deshabilitado con indicador durante el pago; mensajes para
    `PAYMENT_FAILED`, `PAYMENT_DUPLICATE` y `PENDING_CONFIRMATION`; error
    explícito y no bloqueante si Stripe.js no carga; accesibilidad y responsive.
15. `VITE_CULQI_PUBLIC_KEY` → **`VITE_STRIPE_PUBLISHABLE_KEY`** en
    `vite-env.d.ts`, en el código y en `.env.example`; sin la llave configurada,
    la pantalla muestra un error claro y **no** habilita el envío.
16. Los identificadores de Stripe expuestos en el historial de pagos
    (`PaymentsPage`) usan `stripePaymentIntentId`.

### Terraform y CI/CD

17. `aws_ssm_parameter.culqi_private_key` → **`aws_ssm_parameter.stripe_secret_key`**
    (`/activa-club/{env}/stripe/secret-key`) y
    `aws_ssm_parameter.culqi_webhook_secret` →
    **`aws_ssm_parameter.stripe_webhook_signing_secret`**
    (`/activa-club/{env}/stripe/webhook-signing-secret`), ambos `SecureString`
    con `lifecycle { ignore_changes = [value] }` y placeholder
    `PENDIENTE_STRIPE_TEST_KEY`.
18. Variables de entorno de las Lambdas: `CULQI_PRIVATE_KEY_PARAM_NAME` →
    **`STRIPE_SECRET_KEY_PARAM_NAME`** (`payments-create`) y
    `CULQI_WEBHOOK_SECRET_PARAM_NAME` → **`STRIPE_WEBHOOK_SECRET_PARAM_NAME`**
    (`payments-webhook`).
19. El IAM sigue siendo de **mínimo privilegio**: `payments-create` solo lee el
    ARN del parámetro de la llave secreta, `payments-webhook` solo el del
    signing secret; ninguna otra Lambda puede leerlos (criterio 8 de US-026).
20. `deploy-dev.yml` inyecta `VITE_STRIPE_PUBLISHABLE_KEY` desde la variable de
    repositorio **`DEV_STRIPE_PUBLISHABLE_KEY`**, con placeholder
    `pk_test_PENDIENTE_STRIPE_TEST_KEY`.
21. Tras el apply, los valores reales se recargan por
    `aws ssm put-parameter --overwrite` según
    `docs/deployment/despliegue-dev.md`, y se verifica que los parámetros con
    los nombres antiguos de Culqi ya no existan.

### Verificación en vivo (equivalente a US-026, ahora con Stripe)

22. En `dev`, con un socio de prueba desechable, se ejecuta y se deja evidencia
    de: (a) pago exitoso con `4242 4242 4242 4242` → socio `ACTIVE` con
    `membershipEndsAt` correcto; (b) pago rechazado con
    `4000 0000 0000 0002` → `PAYMENT_FAILED`, membresía intacta; (c) doble envío
    con la misma `idempotencyKey` → un solo PaymentIntent en el dashboard de
    Stripe.
23. Se inspeccionan los ítems reales de DynamoDB (`Payment`,
    `PaymentIdempotency`, `Member`, `MembershipPeriod`) y **no** contienen PAN,
    CVC, `stripePaymentMethodId`, `client_secret` ni llaves.
24. Se inspeccionan los logs de CloudWatch de `payments-create` y
    `payments-webhook` tras un pago exitoso, uno fallido y un webhook, y **no**
    contienen datos de tarjeta, secretos, ni el cuerpo crudo de la petición.
25. **Se cierra el pendiente que US-026 dejó abierto**: la verificación en vivo
    de `POST /payments/webhook` (no ejecutable con Culqi por ser un stub) se
    realiza ahora enviando un evento firmado real (`stripe trigger` /
    `stripe listen` de la CLI oficial, o reenvío desde el dashboard), más un
    intento con firma inválida que debe rechazarse con 401 sin efectos.
26. Se envía `cardNumber`/`cvv` en el body de `POST /payments` y se verifica que
    sigue devolviendo 400 `VALIDATION_ERROR` (no regresión de `.strict()`).
27. El repositorio no versiona ninguna llave de Stripe; `.env.example` documenta
    solo nombres de variable.
28. La evidencia se adjunta al Pull Request, sin ningún dato real de tarjeta.

### Documentación y trazabilidad

29. `docs/testing/matriz-trazabilidad.md` §3 queda actualizada con el resultado
    real de P-02, P-03, P-04, P-06, P-07 y P-08 contra Stripe.
30. `apps/api/README.md` y `apps/web/README.md` reflejan los módulos y variables
    nuevos.

## Casos alternativos / excepciones

- **La cuenta de test no acepta `currency: 'pen'`**: no se cambia el monto ni la
  moneda en silencio. Se escala al Product Owner y se resuelve con un ADR
  complementario (ADR-0011, "Validaciones requeridas").
- **El renombrado de los parámetros SSM deja huérfanos los antiguos**: se
  eliminan explícitamente; un parámetro con una llave real olvidado en la cuenta
  es un hallazgo de seguridad, no un detalle cosmético.
- **La ventana entre el apply y la recarga de valores reales**: los pagos fallan
  con `PENDING_CONFIRMATION` (placeholder inválido), nunca activan una membresía.
  Es el comportamiento correcto; se documenta en el PR.
- **Regresión de idempotencia**: si el header nativo de Stripe y el ítem de
  DynamoDB se contradijeran (p. ej. el ítem se venció por TTL antes que la clave
  de Stripe, cuya expiración es de 24 h), prevalece **no volver a cobrar**; el
  caso se registra para diagnóstico.
- **Stripe.js bloqueado por un adblocker**: mismo tratamiento que ya tenía
  Culqi.js — error explícito, sin habilitar un camino alternativo que envíe
  datos de tarjeta a la API propia.

## Sugerencia de pruebas funcionales

- P-02 (E2E), P-03, P-04, P-06, P-07, P-08 y P-12 re-ejecutados contra Stripe
  test mode con sus tarjetas de prueba documentadas.
- Unitarias del mapeo de estados de ADR-0011 §D5 (incluido el caso
  `StripeCardError`) con el SDK mockeado.
- Unitaria de verificación de firma: cuerpo crudo válido → 202; cuerpo
  re-serializado o firma alterada → 401.
- Búsqueda de `culqi` (case-insensitive) en `apps/`, `packages/`,
  `infrastructure/` y `.github/`: solo debe quedar vacío.

## Ubicación en el backlog

Se registra como **deuda técnica de EP-03 arrastrada al Sprint 3**, no como una
historia suelta del Sprint 2 ya cerrado. Motivos, explícitos para que la
decisión sea revisable:

- **No se reabre un sprint cerrado.** El Sprint 2 entregó lo que su alcance
  definía contra la decisión vigente en ese momento (ADR-0007). Reescribirlo
  falsearía el registro histórico.
- **Bloquea al Sprint 3.** Su grafo de dependencias parte de "Sprint 2 cerrado:
  socios `ACTIVE` al día", condición que hoy no se cumple porque el cargo nunca
  se ejecuta. Sin US-037, los casos A-15 y P-10 no pueden cerrarse en este
  sprint como está previsto.
- **Su causa es externa y posterior**, no un defecto de ejecución del Sprint 2:
  la restricción de RUC de Culqi se confirmó después del cierre.

Va en la **ola 1 del Sprint 3**, en paralelo con US-027 (DevOps): las dos tocan
Terraform pero recursos distintos (parámetros SSM de pagos vs. endpoints de
reservas), y ninguna historia de reservas depende de US-037 para empezar.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-01/04/05/06/07/08, RN-ACT-07. ADR-0011 (reemplaza ADR-0007).
  Riesgos RT-01, RT-05, RT-06, RT-14.
- Casos de prueba: P-02, P-03, P-04, P-06, P-07, P-08, P-12; cierra A-15.
- Migra lo entregado por: US-019, US-021, US-022, US-024, US-025, US-026.
- Habilita: la precondición de EP-04 (socios `ACTIVE` al día) y la demo en vivo
  del recorrido completo del socio.
