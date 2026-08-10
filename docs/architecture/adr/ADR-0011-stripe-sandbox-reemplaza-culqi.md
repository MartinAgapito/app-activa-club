# ADR-0011 — Stripe (test mode) reemplaza a Culqi como pasarela de pagos

- **Estado**: Aceptado
- **Fecha**: 2026-08-09
- **Decisores**: Product Owner (decisión de producto), Arquitecto (diseño de la
  integración)
- **Reemplaza a**: [ADR-0007](./ADR-0007-culqi-sandbox-idempotencia-pagos.md)
  (Culqi sandbox e idempotencia de pagos)
- **Historia relacionada**: [US-037](../../scrum/historias/US-037-migrar-pasarela-culqi-a-stripe.md)
  (migración); afecta lo entregado en US-019, US-021, US-022, US-024 y US-026.

> **Numeración**: los identificadores ADR-0009 y ADR-0010 quedan sin asignar. La
> numeración de este registro fue fijada por el Product Owner al comunicar el
> pivote y ya se referenció en la coordinación del equipo; se prefiere mantener
> el hueco antes que renumerar una decisión ya comunicada.

## Contexto

Toda la superficie de pagos del MVP (EP-03, Sprint 2) se construyó sobre
**Culqi sandbox**: RN-PAG-04 lo nombra explícitamente, ADR-0007 fijó el flujo
(tokenización en cliente + cargo server-side + idempotencia + webhook), y las
historias US-019, US-021, US-022, US-024 y US-026 se implementaron y
desplegaron contra ese diseño.

Sin embargo, el módulo nunca llegó a ejecutar un cargo real:

- El secreto de SSM (`aws_ssm_parameter.culqi_private_key`) sigue con el
  placeholder `PENDIENTE_CULQI_SANDBOX_KEY` (US-019).
- `apps/api/src/payments/culqi-client.ts` expone `notImplementedCulqiClient`,
  un stub que **falla explícitamente** en vez de simular un resultado, de modo
  que `POST /payments` nunca activa una membresía con datos inventados.
- En consecuencia, hoy **ningún socio puede llegar a `memberStatus=ACTIVE` por
  pago** en `dev`, lo que además deja sin cumplir la precondición que el
  Sprint 3 asume ("Sprint 2 cerrado: socios `ACTIVE` al día").

La causa raíz es una restricción externa, verificada y no negociable:

> **Culqi exige RUC** (persona jurídica, o persona natural con negocio inscrito
> en SUNAT) para emitir credenciales, **incluso para las llaves de sandbox**:
> el alta de comercio pasa por su formulario de afiliación, que pide RUC,
> representante legal y cuenta bancaria del negocio antes de entregar el par
> `pk_test_`/`sk_test_`.

Este es un **proyecto de tesis universitaria**, sin RUC ni persona jurídica
disponible. La restricción no se resuelve con esfuerzo de ingeniería: no
depende de nosotros.

Se evaluó también **Mercado Pago Perú**, que presenta la misma traba (requiere
identificación tributaria del vendedor para credenciales productivas y ata las
credenciales de prueba a una cuenta de vendedor validada).

**Stripe**, en cambio, permite crear una cuenta y operar en **test mode**
(`pk_test_` / `sk_test_`) **sin activar la cuenta**, es decir sin razón social,
sin identificación tributaria, sin cuenta bancaria y sin verificación KYC. El
test mode es un entorno completo y separado, con sus propias llaves, webhooks y
objetos; las solicitudes con llave de prueba nunca tocan las redes bancarias.
La activación con datos de negocio solo es necesaria para pasar a live mode,
que está **fuera del alcance** de esta tesis (el MVP nunca cobra dinero real).

Fuentes: documentación oficial de Stripe sobre
[test mode y datos de prueba](https://docs.stripe.com/testing),
[llaves de API](https://docs.stripe.com/keys),
[monedas soportadas](https://docs.stripe.com/currencies) (PEN está en la lista
de monedas de presentación) y el formulario de afiliación de comercios de
Culqi (solicitud de RUC).

### Naturaleza del cambio

Esto es un **cambio de proveedor documentado y autorizado por el Product
Owner**, no un recorte ni una ampliación de alcance:

- El alcance funcional es **idéntico** al de la matriz de alcance §3: pago con
  tarjeta, confirmación segura, idempotencia, historial, renovación.
- Las reglas de negocio de pagos (RN-PAG-01 a RN-PAG-08) **no cambian de
  intención**; solo se actualiza el nombre del proveedor en RN-PAG-04 y
  RN-PAG-08.
- Los contratos de API mantienen sus rutas, verbos, códigos de error y
  semántica; cambian únicamente los **nombres de campos específicos del
  proveedor**.

## Decisión

Se adopta **Stripe en test mode** como única pasarela de pagos del proyecto,
con el patrón moderno recomendado por Stripe: **Stripe.js/Elements en el
cliente + PaymentIntents en el servidor**. Se preservan íntegras las garantías
que ya exigían RN-PAG-07, RN-PAG-08 y ADR-0007.

### D1. Separación cliente/servidor (RN-PAG-08 intacta)

- **Cliente**: `@stripe/stripe-js` + `@stripe/react-stripe-js` montan un
  **Payment Element** (o Card Element) con la **llave publicable**
  (`pk_test_`). Los campos de tarjeta viven dentro de los iframes de Stripe: el
  PAN, el CVC y la fecha de vencimiento **nunca** entran al DOM de la
  aplicación, ni al estado de React, ni a ningún `fetch` propio. El cliente
  llama a `stripe.createPaymentMethod(...)` y obtiene un
  **`paymentMethodId`** (`pm_...`), que es el equivalente exacto del
  `culqiToken` actual.
- **Servidor**: la Lambda de `POST /payments` crea el **PaymentIntent** con la
  **llave secreta** (`sk_test_`, leída de SSM en tiempo de ejecución, nunca en
  el repo ni en el bundle del cliente). El monto y la moneda los resuelve
  siempre el backend (`apps/api/src/payments/plans.ts`), nunca el cliente.

Esto es al menos tan estricto como el flujo de Culqi: el backend sigue sin ver
un solo dato de tarjeta.

### D2. SDK oficial en vez de HTTP manual

Se usa el paquete oficial **`stripe`** de Node.js (dependencia de `apps/api`),
no `fetch` contra `api.stripe.com`. Motivos:

- Soporte nativo del header **`Idempotency-Key`** como opción de request.
- **Verificación de firma de webhook** provista por la librería
  (`stripe.webhooks.constructEvent`), que implementa el esquema
  `t=<timestamp>,v1=<hmac>` con comparación en tiempo constante y **tolerancia
  de timestamp** (anti-replay). No se implementa a mano: una verificación
  manual de firma es exactamente el tipo de código donde un error silencioso
  se convierte en un endpoint público falsificable (RT-14).
- Reintentos y tipado de errores (`StripeCardError`, `StripeConnectionError`)
  ya resueltos y probados por el proveedor.

En el frontend se usa `@stripe/stripe-js` (carga el script desde el dominio de
Stripe, requisito de PCI-DSS SAQ A) y `@stripe/react-stripe-js`.

### D3. Creación del cargo (`POST /payments`)

La llamada canónica —Backend la implementa tal cual, sin inventar parámetros:

```ts
const intent = await stripe.paymentIntents.create(
  {
    amount: plan.amount, // céntimos; misma unidad mínima que ya usa el dominio
    currency: plan.currency.toLowerCase(), // 'pen'
    payment_method: input.stripePaymentMethodId,
    confirm: true,
    // Evita métodos con redirección: el MVP no implementa retorno 3DS/SCA.
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { paymentId: input.reference },
    description: `Membresía ${plan.type} — Activa Club`,
  },
  { idempotencyKey: input.idempotencyKey },
);
```

- `metadata.paymentId` es el **único** correlacionador entre Stripe y este
  backend (reemplaza a `data.object.metadata.reference` del diseño de Culqi).
  Nunca se envían datos personales del socio en `metadata`.
- `amount` va en la **unidad mínima** de la moneda; PEN es una moneda de dos
  decimales, así que la semántica de "céntimos" que ya usa el dominio se
  mantiene sin conversión.

### D4. Doble idempotencia: nativa de Stripe + ítem propio en DynamoDB

Conviven **dos** mecanismos, deliberadamente:

1. **`Idempotency-Key` nativo de Stripe** (la misma `idempotencyKey` que el
   cliente envía en el request). Protege contra el **doble cargo en el
   proveedor**: si la primera llamada llegó a Stripe pero la respuesta se
   perdió, el reintento devuelve el **mismo** PaymentIntent en vez de crear
   uno nuevo. Es la única defensa posible para la ventana de tiempo en que el
   cargo ya existe del lado de Stripe pero nuestro backend todavía no lo sabe.
   Las claves de idempotencia de Stripe expiran a las 24 h.
2. **Ítem `PaymentIdempotency` en DynamoDB** (`attribute_not_exists`, con TTL),
   tal como lo definió ADR-0007 y ya está implementado
   (`apps/api/src/payments/idempotency.ts`). Protege la **consistencia del
   dominio propio**: garantiza que un reintento no cree un segundo `Payment`,
   ni un segundo `MembershipPeriod`, ni extienda la vigencia dos veces, y
   permite responder `409 PAYMENT_DUPLICATE` con el resultado previo **sin
   siquiera llamar a Stripe**.

**Por qué los dos y no solo uno**: el de Stripe protege el dinero, el nuestro
protege el estado de membresía. Ninguno cubre al otro. El de Stripe no sabe
nada de `MembershipPeriod` ni de `outstandingBalance`; el nuestro no puede
impedir un cargo que ya salió si el proceso murió después de enviarlo. Además,
la reserva previa en DynamoDB evita tráfico innecesario al proveedor en el caso
del doble clic, que es el más frecuente. El costo de mantener ambos es nulo:
es la misma cadena, usada en dos capas.

### D5. Mapeo de estados Stripe → `PaymentStatus`

Confirmación **síncrona** (respuesta de `paymentIntents.create` con
`confirm: true`):

| Resultado del SDK                                     | Outcome interno | `PaymentStatus`        | Respuesta HTTP           |
| ----------------------------------------------------- | --------------- | ---------------------- | ------------------------ |
| `status: 'succeeded'`                                 | `APPROVED`      | `SUCCEEDED`            | 201                      |
| `status: 'processing'`                                | `AMBIGUOUS`     | `PENDING_CONFIRMATION` | 201                      |
| `status: 'requires_action'` / `requires_confirmation` | `AMBIGUOUS`     | `PENDING_CONFIRMATION` | 201                      |
| `status: 'requires_capture'`                          | `AMBIGUOUS`     | `PENDING_CONFIRMATION` | 201                      |
| `status: 'requires_payment_method'`                   | `DECLINED`      | `FAILED`               | 402/422 `PAYMENT_FAILED` |
| `status: 'canceled'`                                  | `DECLINED`      | `FAILED`               | 402/422 `PAYMENT_FAILED` |
| Excepción `StripeCardError` (tarjeta rechazada)       | `DECLINED`      | `FAILED`               | 402/422 `PAYMENT_FAILED` |
| Excepción de red/timeout/otra                         | `AMBIGUOUS`     | `PENDING_CONFIRMATION` | 201                      |

> **Detalle que no se debe inventar**: con `confirm: true`, una tarjeta
> rechazada **no** devuelve un PaymentIntent con estado de fallo — el SDK
> **lanza** un `StripeCardError` (HTTP 402). El backend debe capturarlo por
> `error.type === 'StripeCardError'` y tomar el estado real de
> `error.payment_intent?.status`. Cualquier otra excepción se normaliza a
> `AMBIGUOUS`, siguiendo la política ya vigente de `attemptCharge` en
> `apps/api/src/payments/charge.ts` (un pago que sí llegó a intentarse nunca se
> pierde sin dejar rastro).

Confirmación **asíncrona** (webhook):

| `event.type`                    | `PaymentStatus` resultante | Nota                                                    |
| ------------------------------- | -------------------------- | ------------------------------------------------------- |
| `payment_intent.succeeded`      | `SUCCEEDED`                | Activa/extiende la membresía una sola vez (idempotente) |
| `payment_intent.payment_failed` | `FAILED`                   | No toca ningún campo de membresía                       |
| Cualquier otro `event.type`     | sin efecto                 | 202, se registra para diagnóstico                       |

Ambas rutas **convergen** al mismo estado final sin importar cuál llegue
primero, exactamente como ya definía ADR-0007 (criterio 10 de US-024).

### D6. Webhook y verificación de firma

- Ruta pública `POST /payments/webhook`, sin Cognito Authorizer, con
  verificación de firma **antes** de leer o aplicar cualquier efecto.
- Header **`Stripe-Signature`** (reemplaza a `X-Culqi-Signature`).
- Verificación con `stripe.webhooks.constructEvent(rawBody, signatureHeader,
webhookSigningSecret)`. **Requiere el cuerpo crudo**: en API Gateway REST +
  Lambda hay que usar `event.body` sin parsear y decodificar si
  `event.isBase64Encoded` es `true`. Parsear a JSON y volver a serializar
  invalida la firma.
- Firma inválida, ausente o fuera de la tolerancia de timestamp → **401
  `UNAUTHENTICATED`**, sin ningún efecto (mismo comportamiento que hoy).
- Respuesta **202** siempre que la firma sea válida, cualquiera sea el desenlace
  de negocio, para no filtrar por código HTTP si un `paymentId` existe.

### D7. Persistencia (RN-PAG-08 intacta)

Se guardan `paymentId`, **`stripePaymentIntentId`**, monto, moneda, estado,
tipo de membresía, `idempotencyKey`, `autoRenewRequested`, `failureReason` y
marcas de tiempo. **Nunca** PAN, CVC, fecha de vencimiento, `paymentMethodId`
persistido, ni llaves de Stripe. Tampoco se persisten los últimos 4 dígitos ni
la marca de la tarjeta: el MVP no los necesita y no tenerlos es una superficie
menos que auditar.

### D8. Nomenclatura final (vinculante)

Backend, Frontend y DevOps usan estos nombres **literalmente**. Ningún agente
debe elegir un sinónimo.

| Concepto                             | Culqi (actual)                           | **Stripe (final)**                                                                                          |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Campo del request `POST /payments`   | `culqiToken`                             | **`stripePaymentMethodId`**                                                                                 |
| Id externo del cargo (entidad/API)   | `culqiChargeId`                          | **`stripePaymentIntentId`**                                                                                 |
| Header de firma del webhook          | `X-Culqi-Signature`                      | **`Stripe-Signature`**                                                                                      |
| Correlación en el evento             | `data.object.metadata.reference`         | **`data.object.metadata.paymentId`**                                                                        |
| Tipos de evento del webhook          | `charge.succeeded` / `charge.failed`     | **`payment_intent.succeeded`** / **`payment_intent.payment_failed`**                                        |
| Parámetro SSM (llave secreta)        | `/activa-club/dev/culqi/private-key`     | **`/activa-club/{env}/stripe/secret-key`**                                                                  |
| Recurso Terraform (llave secreta)    | `aws_ssm_parameter.culqi_private_key`    | **`aws_ssm_parameter.stripe_secret_key`**                                                                   |
| Env var de la Lambda de pago         | `CULQI_PRIVATE_KEY_PARAM_NAME`           | **`STRIPE_SECRET_KEY_PARAM_NAME`**                                                                          |
| Parámetro SSM (firma del webhook)    | `/activa-club/dev/culqi/webhook-secret`  | **`/activa-club/{env}/stripe/webhook-signing-secret`**                                                      |
| Recurso Terraform (firma)            | `aws_ssm_parameter.culqi_webhook_secret` | **`aws_ssm_parameter.stripe_webhook_signing_secret`**                                                       |
| Env var de la Lambda de webhook      | `CULQI_WEBHOOK_SECRET_PARAM_NAME`        | **`STRIPE_WEBHOOK_SECRET_PARAM_NAME`**                                                                      |
| Variable de build del frontend       | `VITE_CULQI_PUBLIC_KEY`                  | **`VITE_STRIPE_PUBLISHABLE_KEY`**                                                                           |
| Variable de repositorio GitHub       | `DEV_CULQI_PUBLIC_KEY`                   | **`DEV_STRIPE_PUBLISHABLE_KEY`**                                                                            |
| Placeholder del secreto (sin cuenta) | `PENDIENTE_CULQI_SANDBOX_KEY`            | **`PENDIENTE_STRIPE_TEST_KEY`**                                                                             |
| Módulo backend del cliente de cargo  | `apps/api/src/payments/culqi-client.ts`  | **`apps/api/src/payments/stripe-client.ts`**                                                                |
| Tipo del cliente inyectable          | `CulqiChargeClient`                      | **`StripeChargeClient`**                                                                                    |
| Tipo de entrada del cargo            | `CulqiChargeInput`                       | **`StripeChargeInput`**                                                                                     |
| Tipo de resultado del cargo          | `CulqiChargeOutcome`                     | **`StripeChargeOutcome`**                                                                                   |
| Stub sin integración                 | `notImplementedCulqiClient`              | **`notImplementedStripeClient`** (se elimina al entrar el cliente real)                                     |
| Fábrica del cliente real             | —                                        | **`createStripeChargeClient`**                                                                              |
| Módulo frontend de la pasarela       | `apps/web/src/payments/culqi.ts`         | **`apps/web/src/payments/stripe.ts`**                                                                       |
| Error de pasarela en el frontend     | `CulqiError`                             | **`StripePaymentError`**                                                                                    |
| Función de tokenización del cliente  | `requestCulqiToken`                      | **`createStripePaymentMethod`**                                                                             |
| Campo prohibido en logs              | `culqiToken`, `culqiSecretKey`           | **`stripePaymentMethodId`**, `stripeSecretKey`, `client_secret` (se **suman** a los actuales, no se quitan) |

Forma final de los tipos del cliente de cargos (Backend implementa esta
interfaz; el consumidor es `apps/api/src/payments/charge.ts`):

```ts
export interface StripeChargeInput {
  /** `pm_...` creado por Stripe.js en el cliente (RN-PAG-08: nunca PAN/CVC). */
  stripePaymentMethodId: string;
  /** Monto en unidad mínima (céntimos), resuelto por el backend (`./plans.ts`). */
  amount: number;
  currency: Currency;
  /** `paymentId` propio; viaja como `metadata.paymentId` del PaymentIntent. */
  reference: string;
  /** Se envía como `Idempotency-Key` nativo de Stripe (D4). */
  idempotencyKey: string;
}

export type StripeChargeOutcome =
  | { outcome: 'APPROVED'; stripePaymentIntentId: string }
  | { outcome: 'DECLINED'; reason: string }
  | { outcome: 'AMBIGUOUS' };

export type StripeChargeClient = (input: StripeChargeInput) => Promise<StripeChargeOutcome>;
```

> Cambios respecto de la interfaz actual: se renombra `culqiToken` →
> `stripePaymentMethodId`, `culqiChargeId` → `stripePaymentIntentId`, y se
> **agrega** `idempotencyKey` (que hoy no llegaba al cliente de cargo porque
> Culqi no exponía idempotencia nativa). `charge.ts` debe pasar
> `input.request.idempotencyKey` en la llamada a `attemptCharge`. `reference`
> conserva su nombre a propósito: es el nombre del dominio, no del proveedor.

### D9. Mensajes de rechazo

`failureReason` se construye desde un **catálogo propio** mapeado por
`error.code` / `error.decline_code` de Stripe (p. ej. `card_declined`,
`expired_card`, `incorrect_cvc`, `insufficient_funds`). **No** se propaga el
mensaje crudo del proveedor al socio ni a los logs, en línea con el criterio 5
de US-026 y con lo que ya hace `charge.ts` (registra `error.name`, nunca el
cuerpo crudo).

## Alternativas consideradas

- **Culqi con el RUC de un tercero** (familiar, empresa conocida, etc.).
  **Rechazada**: no es sostenible ni reproducible. Cualquier persona que retome
  el proyecto —incluido el jurado si quisiera verificarlo— quedaría bloqueada
  sin ese RUC prestado; además implica usar la identidad tributaria de un
  tercero para un fin que no le corresponde. Una tesis debe poder reproducirse
  con sus propias credenciales.
- **Mercado Pago Perú**. **Rechazada**: misma traba de identificación
  tributaria del vendedor. Cambiar de proveedor para chocar con la misma pared
  no aporta nada.
- **Simulador propio del contrato de Culqi** (implementar
  `notImplementedCulqiClient` como un mock determinista con tarjetas de prueba
  ficticias). **Rechazada**: tiene un costo de mantenimiento permanente
  (mantener el simulador fiel a un contrato que no podemos verificar), no
  demuestra integración real con una pasarela ante un jurado, y no ejercita
  nada de lo verdaderamente difícil (firma de webhook real, idempotencia real
  del proveedor, errores reales de red). Stripe test mode entrega un **backend
  real** —firma real, PaymentIntents reales, tarjetas de prueba
  documentadas— sin ese costo y sin mover dinero.
- **Mantener Culqi y dejar el módulo de pagos como "no verificable"**.
  **Rechazada**: dejaría RN-ACT-07 sin cerrar y bloquearía la precondición del
  Sprint 3 (socios `ACTIVE` al día).
- **Stripe Checkout (página alojada por Stripe, con redirección)** en vez de
  Elements. **Rechazada** para el MVP: rompe la SPA con una redirección
  externa y obliga a manejar `return_url`, sesiones de Checkout y estados de
  retorno. Elements mantiene el checkout dentro de la aplicación y preserva
  1:1 la forma del contrato ya implementado (`POST /payments` con un
  identificador de método de pago), que es lo que minimiza el trabajo de
  migración.

## Consecuencias

### Positivas

- **El módulo de pagos pasa a funcionar de verdad.** No es una simulación: los
  cargos de prueba son llamadas reales a la API de Stripe, con PaymentIntents
  reales, webhooks firmados reales y errores reales; lo único que no ocurre en
  test mode es el movimiento de dinero. Esto es defendible ante un jurado y
  demostrable en vivo.
- **Se desbloquea la precondición del Sprint 3**: un socio puede volverse
  `ACTIVE` pagando, cerrando RN-ACT-07 y el caso A-15.
- **Reproducible por cualquiera**: quien retome el proyecto crea su cuenta
  Stripe, obtiene sus `pk_test_`/`sk_test_` en minutos y no necesita RUC.
- **Mejor idempotencia que antes**: ahora también a nivel del proveedor (D4).
- **Verificación de firma más robusta**: el esquema de Stripe incluye
  tolerancia de timestamp (anti-replay), que el diseño HMAC plano de Culqi no
  contemplaba.
- **Tarjetas de prueba documentadas y estables** (`4242 4242 4242 4242` para
  aprobado, `4000 0000 0000 0002` para rechazado, etc.), lo que hace
  repetibles los casos P-02, P-03 y P-08.

### Negativas / costos

- **Trabajo de migración real** en backend, frontend, Terraform y CI/CD
  (US-037), sobre código ya desplegado y probado.
- **Deuda documental**: US-021, US-022, US-024 y US-026 quedan descritas contra
  un proveedor que ya no se usa. Se resuelve con una nota de trazabilidad al
  principio de cada una, **sin reescribir su contenido** (son evidencia real de
  lo que se implementó y verificó en el Sprint 2).
- **Dependencia de un proveedor no peruano**: en un despliegue productivo real
  del club, Stripe no opera localmente en Perú del mismo modo que Culqi, por lo
  que un pase a producción exigiría reevaluar la pasarela. Esto **no afecta al
  MVP** (que nunca sale de test mode) pero debe quedar dicho: es una limitación
  honesta del alcance, no un descuido.
- **Dos rutas de confirmación** (síncrona y webhook) que deben converger
  idempotentemente — igual que en ADR-0007, sin cambio.

### Impacto por rol

- **Backend (US-037)**: renombrar `culqi-client.ts` → `stripe-client.ts` con la
  interfaz de D8; implementar `createStripeChargeClient` con el SDK `stripe`;
  ajustar `charge.ts` para pasar `idempotencyKey`; reescribir la verificación
  de firma del webhook usando `stripe.webhooks.constructEvent` (elimina
  `webhook-signature.ts` propio) y el esquema de evento
  (`webhook-event-schema.ts`) para la forma de Stripe; ampliar la lista de
  campos prohibidos del logger.
- **Frontend (US-037)**: reemplazar `payments/culqi.ts` por `payments/stripe.ts`
  con `@stripe/stripe-js` + `@stripe/react-stripe-js`; el `CheckoutPage` monta
  el Payment Element y envía `stripePaymentMethodId`. La `idempotencyKey`
  sigue generándose una vez por intento y reutilizándose en reintentos.
- **Terraform (US-037)**: renombrar los dos parámetros SSM y sus variables de
  entorno; el IAM de mínimo privilegio pasa a apuntar a los ARN nuevos. **Ojo**:
  renombrar un `aws_ssm_parameter` implica destruir y recrear el parámetro; el
  valor real debe recargarse después del apply (procedimiento en
  `docs/deployment/despliegue-dev.md`).
- **CI/CD (US-037)**: `deploy-dev.yml` inyecta `VITE_STRIPE_PUBLISHABLE_KEY`
  desde la variable de repositorio `DEV_STRIPE_PUBLISHABLE_KEY`.
- **QA**: P-02, P-03, P-04, P-06, P-07, P-08 y P-12 se re-ejecutan contra
  Stripe test mode con sus tarjetas de prueba; P-06/P-07 pueden ejercitarse con
  `stripe listen` / `stripe trigger` de la CLI oficial, algo que con Culqi no
  era posible sin cuenta.
- **Seguridad**: RN-PAG-08 se mantiene verificable con el mismo criterio; se
  suma `client_secret` a lo que nunca debe loguearse ni exponerse.

### Contratos y documentos afectados

`docs/api/contratos-api.md` §5, `docs/data/modelo-dynamodb.md` §3.5,
`docs/data/diccionario-de-datos.md`, `docs/architecture/architecture-overview.md`,
`docs/architecture/riesgos-tecnicos.md`, `docs/deployment/despliegue-dev.md`,
`docs/product/*`, `docs/testing/matriz-trazabilidad.md` §3, y los paquetes
`packages/shared-types/src/payment.ts` y `packages/validation/src/payment.ts`
(el renombrado de campos en el código es parte de US-037, no de este ADR).

## Validaciones requeridas antes de implementar (US-037)

1. Crear la cuenta Stripe y confirmar que el par `pk_test_`/`sk_test_` está
   disponible **sin activar la cuenta** (sin datos de negocio).
2. Confirmar que la cuenta de test acepta `currency: 'pen'` creando un
   PaymentIntent de prueba. PEN es una moneda de presentación soportada por
   Stripe, pero el conjunto disponible depende del país de la cuenta. **Si no
   fuera aceptada**, no se cambia el monto en silencio: se escala al Product
   Owner y se decide entre crear la cuenta con otro país o registrar
   explícitamente la moneda de cobro en un ADR complementario.
3. Confirmar el monto mínimo de cargo aplicable tras conversión, contra el
   precio del plan mensual (`12000` céntimos = S/ 120,00).
4. Registrar el endpoint de webhook en el dashboard de Stripe (test mode) y
   obtener el **webhook signing secret** (`whsec_...`), que es distinto de la
   llave secreta de cobro.
