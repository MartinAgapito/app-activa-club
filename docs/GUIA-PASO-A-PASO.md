# Guía paso a paso de Activa Club

Un solo documento para operar el proyecto de principio a fin: preparar el
equipo, desplegar, cargar datos, probar, reiniciar y resolver problemas. Cada
paso dice **qué hacer**, **cómo saber que salió bien** y **dónde está el
detalle**. Este archivo no reemplaza a los documentos técnicos: los resume en
orden y apunta a ellos.

> Entorno cubierto: `dev` (cuenta AWS `463310123916`, región `us-east-1`).
> `prd` está preparado pero no se ejecuta todavía (ver paso 10).

## Índice

1. [Qué es el proyecto y cómo está armado](#1-qué-es-el-proyecto-y-cómo-está-armado)
2. [Preparar tu equipo](#2-preparar-tu-equipo)
3. [Primera vez en AWS (una sola vez)](#3-primera-vez-en-aws-una-sola-vez)
4. [Trabajar en una historia y llevarla a dev](#4-trabajar-en-una-historia-y-llevarla-a-dev)
5. [Cargar los socios (migración)](#5-cargar-los-socios-migración)
6. [Probar de punta a punta (E2E)](#6-probar-de-punta-a-punta-e2e)
7. [Reiniciar el entorno y empezar de nuevo](#7-reiniciar-el-entorno-y-empezar-de-nuevo)
8. [Operación diaria: procesos, correos y alarmas](#8-operación-diaria-procesos-correos-y-alarmas)
9. [Problemas frecuentes](#9-problemas-frecuentes)
10. [Pasar a prd](#10-pasar-a-prd)
11. [Dónde está cada detalle](#11-dónde-está-cada-detalle)

---

## 1. Qué es el proyecto y cómo está armado

Activa Club es el sistema de un club deportivo: los socios activan su cuenta
con el DNI, pagan su membresía y reservan instalaciones; el administrador
aprueba, gestiona y mira métricas.

| Pieza            | Qué es                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Frontend         | React + Vite en S3 detrás de CloudFront (`apps/web`)                                          |
| API              | Una Lambda por endpoint detrás de API Gateway, con Cognito (`apps/api`)                       |
| Datos            | Una sola tabla DynamoDB (`activa-club-dev`) con 3 índices (GSI1, GSI2, GSI3)                  |
| Pagos            | Stripe en modo de prueba; los secretos viven en SSM Parameter Store                           |
| Correos          | SES (modo de pruebas: solo entrega a correos verificados)                                     |
| Procesos diarios | EventBridge: vencimiento 00:15, avisos de renovación 08:00, recordatorio 18:00 (hora de Lima) |
| Infraestructura  | Terraform en `infrastructure/terraform`; se aplica solo al mergear a `main`                   |

Roles: `member` (socio) y `admin`. La API cuelga de `/api` en la misma
dirección de CloudFront.

Detalle: [`docs/architecture/architecture-overview.md`](./architecture/architecture-overview.md),
[`docs/product/contexto-maestro.md`](./product/contexto-maestro.md).

## 2. Preparar tu equipo

1. Instala **Node.js 20 o superior**, **npm 10 o superior** y **Git**.
2. Instala la **AWS CLI** y configura el perfil `activa-club-dev` (cuenta
   `463310123916`, región `us-east-1`). Solo lo necesita quien dispare
   procesos o reinicie datos.
3. Clona el repositorio e instala:

   ```bash
   git clone <url-del-repositorio>
   cd _Tesis-app
   npm install
   cp .env.example .env     # completa valores reales; nunca se commitea
   ```

4. Comprueba que todo compila y pasa:

   ```bash
   npm run typecheck && npm test && npm run lint
   ```

**Salió bien si:** los tres comandos terminan sin errores.

Comandos útiles de la raíz: `npm run format` (Prettier), `npm run build`,
`npm run check:handlers` (verifica que cada handler real esté mapeado a una
Lambda y que los placeholders estén declarados), `npm run package:lambdas`.

## 3. Primera vez en AWS (una sola vez)

Solo hace falta si se levanta la cuenta desde cero. En el día a día **no** se
repite.

1. **Bootstrap** (lo aplica una persona con credenciales elevadas, nunca CI):

   ```bash
   cd infrastructure/terraform/bootstrap
   terraform init && terraform plan && terraform apply
   ```

   Crea el rol OIDC de GitHub Actions para desplegar y el almacén de estado.
   Si un cambio futuro necesita un servicio de AWS nuevo, hay que **volver a
   aplicar el bootstrap antes de mergear** ese PR.

2. **Secretos y variables de GitHub** (Settings → Secrets and variables):

   | Nombre                       | Tipo     | Qué es                                    |
   | ---------------------------- | -------- | ----------------------------------------- |
   | `AWS_DEPLOY_DEV_ROLE_ARN`    | Secret   | Rol de despliegue creado por el bootstrap |
   | `AWS_REGION`                 | Variable | `us-east-1`                               |
   | `DEV_SES_SENDER_EMAIL`       | Variable | Remitente de correos de dev               |
   | `DEV_STRIPE_PUBLISHABLE_KEY` | Variable | Llave pública `pk_test_...` de Stripe     |

3. **Secretos de Stripe** (nunca por GitHub; directo en SSM):

   ```bash
   aws ssm put-parameter --name "/activa-club/dev/stripe/secret-key" \
     --type SecureString --value "sk_test_..." --overwrite
   aws ssm put-parameter --name "/activa-club/dev/stripe/webhook-signing-secret" \
     --type SecureString --value "whsec_..." --overwrite
   ```

   El webhook se registra en el panel de Stripe (test mode) apuntando a
   `https://<cloudfront>/api/payments/webhook`, con los eventos
   `payment_intent.succeeded` y `payment_intent.payment_failed`.

4. **Verificar el remitente y los destinatarios en SES.** SES está en modo de
   pruebas: cada correo que recibirá avisos debe verificarse una vez
   (AWS envía un correo con un enlace que **caduca en 24 horas**):

   ```bash
   aws ses verify-email-identity --email-address <correo>
   aws ses get-identity-verification-attributes --identities <correo>   # debe decir Success
   ```

5. Mergear a `main` (paso 4). El primer despliegue crea todo lo demás.

Detalle: [`docs/deployment/despliegue-dev.md`](./deployment/despliegue-dev.md),
[`docs/deployment/terraform-infraestructura.md`](./deployment/terraform-infraestructura.md).

## 4. Trabajar en una historia y llevarla a dev

La regla: **un PR chico por historia**, y a `main` solo entra lo que pasó el CI.

1. Crea una rama desde `main` con el nombre `feat/us-NNN-descripcion`
   (o `fix/...`, `docs/...`).
2. Programa y valida en local: `npm run typecheck && npm test && npm run lint`.
3. Commits con **Conventional Commits** en español, por ejemplo
   `feat(api): resumen personal del socio (US-055)`. Los hooks de git corren
   formato y typecheck al commitear y al hacer push.
4. Abre el PR contra `main` con: alcance, pruebas, impacto en Terraform (si
   toca `infrastructure/`) y plan de reversa.
5. El CI (`CI OK (gate)`) corre lint, typecheck, pruebas, build, controles de
   seguridad y `terraform plan`. Debe estar en verde.
6. **Si el PR toca Terraform o AWS:** revisa el plan antes de mergear. Al
   mergear, el pipeline aplica los cambios de verdad.
7. Mergea (squash). El workflow `deploy-dev.yml` empaqueta las Lambdas,
   aplica Terraform, publica el frontend y corre humo.

**Salió bien si:** el run de `deploy-dev` termina en `success` y la página
`https://<cloudfront>/` responde 200.

Un PR que solo toca documentación no dispara despliegue.

Detalle: [`CONTRIBUTING.md`](../CONTRIBUTING.md),
[`docs/deployment/ci-pull-request.md`](./deployment/ci-pull-request.md).

## 5. Cargar los socios (migración)

La migración trae a los socios del sistema anterior. **Se hace por invocación
directa de una Lambda**, no por la API.

Precondición: la tabla solo tiene los 10 ítems del catálogo de instalaciones.

1. **Elegir el archivo.** `mock-data/legacy-export.json` (datos ficticios,
   versionado) o `mock-data/local/legacy-export.json` (correos y DNI reales del
   equipo; **no se sube a git**).
2. **Subirlo a S3:** consola de AWS → S3 → bucket `activa-club-dev-migration`
   → Upload. El nombre del objeto debe ser exactamente `legacy-export.json`.
3. **Ejecutar la migración:** consola de AWS → Lambda
   `activa-club-dev-migration-run` → pestaña Test → evento `{}` → Test.
   (También: `aws lambda invoke --function-name activa-club-dev-migration-run --payload '{}' --cli-binary-format raw-in-base64-out out.json`.)

**Salió bien si:** responde `total 7`, `migrated 6`, `rejected 1` (el DNI
`10000006` no tiene correo y debe rechazarse). Repetirlo es seguro: los ya
cargados salen como `skipped`.

Socios de prueba que deja la migración:

| DNI        | Quién                           | Estado de membresía                       |
| ---------- | ------------------------------- | ----------------------------------------- |
| `10000001` | Ana (o Sheyla en el JSON local) | Vigente, sin deuda → `ACTIVE`             |
| `10000002` | Luis                            | Saldo pendiente → `DEBT`                  |
| `10000003` | Carla                           | Vence en 7 días o menos → `EXPIRING_SOON` |
| `10000004` | Diego                           | Vencida → `EXPIRED`                       |
| `10000005` | Eva                             | Vigente → `ACTIVE`                        |

Si repites esto otro día, ajusta las fechas de Carla (que venza en 7 días o
menos) y de Diego (que ya haya vencido).

Detalle: [`docs/deployment/migracion-inicial-dev.md`](./deployment/migracion-inicial-dev.md),
[`docs/data/mapeo-migracion.md`](./data/mapeo-migracion.md).

## 6. Probar de punta a punta (E2E)

**Quién hace qué**

- Quien prepara el entorno (acceso a AWS): reinicio, migración y disparo de
  procesos programados.
- Quien prueba (QA): solo necesita el navegador.

**Cuentas**

- Admin: `admin@activaclub.test` (creada fuera de la migración, sin ficha de socio).
- Socios: cada uno activa su cuenta en `/activar-cuenta` con su DNI y elige
  correo y contraseña.

**Tarjetas de prueba de Stripe** (cualquier fecha futura y CVC de 3 dígitos):

| Número                | Resultado              |
| --------------------- | ---------------------- |
| `4242 4242 4242 4242` | Aprobado               |
| `4000 0000 0000 0002` | Rechazada (declinada)  |
| `4000 0000 0000 9995` | Rechazada (sin fondos) |
| `4000 0000 0000 0069` | Rechazada (vencida)    |

**Recorrido recomendado**

1. Verifica que los correos de los probadores estén en SES (paso 3.4).
2. El socio principal activa su cuenta con su DNI → ve su inicio y recibe el
   aviso de bienvenida (en **Notificaciones** del menú, y por correo).
3. Reserva una instalación de confirmación automática (fútbol, tenis, pádel,
   piscina) con un acompañante socio → queda confirmada.
4. Reserva una instalación con aprobación (parrilla o salón) → queda pendiente.
5. Como admin: en el inicio mira "Requiere tu atención", aprueba una reserva y
   rechaza otra con motivo → el socio recibe un aviso distinto por cada una.
6. Concurrencia: dos personas eligen a la vez la misma franja → solo una gana,
   la otra ve el mensaje de franja tomada.
7. Cancela una reserva con más de 24 horas de anticipación.
8. Admin: crea un bloqueo de mantenimiento sobre una reserva activa → el titular
   recibe aviso y la reserva no se cancela sola.
9. Paga una membresía con `4242...` y otro pago con `4000 0000 0000 0002` →
   aparecen en "Mis pagos" y en los pagos del admin.
10. Admin: publica un aviso a un segmento con "también por correo" y mira el
    historial de enviadas.
11. Dispara los procesos programados (paso 8) y revisa que no den error.
12. Admin: compara el resumen del inicio y la **Analítica** con lo que hicieron.
13. Repite el inicio, Reservas y Analítica en celular (375 px) y escritorio.

El plan completo, con casos numerados y resultado esperado, está en la **Guía
de Pruebas** (artefacto interactivo con checks) y en
[`docs/testing/matriz-trazabilidad.md`](./testing/matriz-trazabilidad.md).

## 7. Reiniciar el entorno y empezar de nuevo

Úsalo entre rondas de prueba. **Borra datos de `dev`**; no toca `prd`.

1. Simulacro (no borra, solo cuenta):

   ```bash
   node scripts/dev-reset.mjs
   ```

2. Borrado real (pide escribir `BORRAR`; con `--yes` no pregunta):

   ```bash
   node scripts/dev-reset.mjs --apply
   ```

3. Repite el paso 5 (subir el JSON y ejecutar la migración) y haz que cada
   probador **active su cuenta otra vez**.

**Qué borra:** socios, pagos, períodos de membresía, reservas, participantes,
invitados, bloqueos, auditoría, **notificaciones** y los usuarios de Cognito
(excepto el admin).
**Qué conserva:** el catálogo de 10 instalaciones, el admin, los secretos de
Stripe, los buckets, la infraestructura y los correos verificados en SES.

**Salió bien si:** al final dice `ítems en la tabla = 10`.

Opción `--keep-cognito`: no borra usuarios de Cognito. Para un E2E limpio no
conviene, porque los socios migrados no podrían activarse con su mismo correo.

## 8. Operación diaria: procesos, correos y alarmas

**Procesos programados.** Se ejecutan solos; para probar sin esperar, se
invocan a mano con evento `{}`:

| Proceso                               | Hora (Lima) | Qué hace                                                 |
| ------------------------------------- | ----------- | -------------------------------------------------------- |
| `activa-club-dev-memberships-expire`  | 00:15       | Pasa membresías a por vencer o vencida y deja el rastro  |
| `activa-club-dev-memberships-notify`  | 08:00       | Avisa a quienes cambiaron de estado (consume ese rastro) |
| `activa-club-dev-reservations-remind` | 18:00       | Recuerda a cada titular su reserva del día siguiente     |

```bash
aws lambda invoke --function-name activa-club-dev-reservations-remind \
  --payload '{}' --cli-binary-format raw-in-base64-out out.json && cat out.json
```

Respuesta en cero es normal si no hay nada que avisar. Un proceso que termina
en error dispara su alarma de CloudWatch.

**Correos.**

- La **bandeja interna** (menú Notificaciones del socio) siempre se escribe.
- El **correo** es de mejor esfuerzo: si falla, no rompe la acción. En el log
  de la Lambda emisora aparece `inbox: WRITTEN` y `email: SENT` o `FAILED`.
- En modo de pruebas de SES solo llegan correos a direcciones verificadas;
  revisa también la carpeta de spam.
- Cada publicación del admin envía como máximo 15 correos.

**Alarmas.** El plan gratuito de CloudWatch incluye 10 alarmas. Hoy `dev` usa 8. Antes de añadir un endpoint con alarma, comprueba el conteo:

```bash
aws cloudwatch describe-alarms --alarm-name-prefix activa-club-dev --query 'length(MetricAlarms)'
```

**Ver logs de una Lambda:**

```bash
aws logs tail /aws/lambda/activa-club-dev-<funcion> --since 30m
```

## 9. Problemas frecuentes

| Síntoma                                                       | Causa probable                                            | Qué hacer                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| "No se encuentra el DNI" al activar                           | No se ejecutó la migración (aunque el archivo esté en S3) | Ejecuta la Lambda `migration-run` (paso 5.3)                          |
| El correo no llega, el log dice `email: FAILED`               | El destinatario no está verificado en SES                 | Verifícalo (paso 3.4); la bandeja interna sí tiene el aviso           |
| `AccessDeniedException` al enviar correo                      | Permiso de SES sin cubrir identidades en sandbox          | Ya corregido en #146; si reaparece, revisa `ses_send_email_statement` |
| Endpoint responde 501                                         | Sigue el placeholder `not-implemented.ts`                 | `npm run check:handlers` muestra qué historia falta                   |
| 401 en un endpoint                                            | Sin token o token vencido (dura 1 hora)                   | Inicia sesión de nuevo                                                |
| 403 en una pantalla                                           | Rol equivocado (socio en ruta de admin o al revés)        | Entra con la cuenta del rol correcto                                  |
| Un socio con deuda o vencido no puede reservar                | Regla del negocio (RN-PAG-06 / RN-RES-12)                 | Que pague su membresía en `/socio/membresia`                          |
| `terraform plan` del CI muestra reemplazar la identidad SES   | El CI usa un remitente de relleno                         | Es ruido; el despliegue real usa `DEV_SES_SENDER_EMAIL`               |
| `AccessDenied` en el despliegue tras añadir un servicio nuevo | El rol de CI no tiene el permiso                          | Aplica el bootstrap a mano **antes** de mergear (paso 3.1)            |
| La migración responde `skipped 6`                             | Ya estaban cargados                                       | Es correcto (idempotente); para empezar limpio, paso 7                |

## 10. Pasar a prd

`prd` es el "entorno final" del proyecto (no existe un `prod` separado). Está
preparado pero **no ejecutable todavía**. Faltan, en orden:

1. Crear el GitHub Environment `prd` con al menos un revisor obligatorio.
2. Crear el rol de despliegue de prd en el bootstrap y aplicarlo.
3. Completar `environments/prd/main.tf` con los mismos endpoints de `dev`.
4. Cargar los secretos y variables propios de prd.

Después el despliegue se dispara a mano (`workflow_dispatch`) y espera la
aprobación humana.

Detalle: [`docs/deployment/despliegue-prd.md`](./deployment/despliegue-prd.md).

## 11. Dónde está cada detalle

| Necesito...                              | Documento                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Entender qué es y qué no es el MVP       | [`docs/product/contexto-maestro.md`](./product/contexto-maestro.md), [`matriz-de-alcance.md`](./product/matriz-de-alcance.md)               |
| Reglas de negocio (RN-*)                 | [`docs/product/reglas-de-negocio.md`](./product/reglas-de-negocio.md)                                                                       |
| Contratos de la API (endpoints, errores) | [`docs/api/contratos-api.md`](./api/contratos-api.md)                                                                                       |
| Modelo de datos y patrones de acceso     | [`docs/data/modelo-dynamodb.md`](./data/modelo-dynamodb.md)                                                                                 |
| Decisiones de arquitectura (ADR)         | [`docs/architecture/adr/`](./architecture/adr/)                                                                                             |
| Infraestructura Terraform                | [`docs/deployment/terraform-infraestructura.md`](./deployment/terraform-infraestructura.md)                                                 |
| CI de Pull Request                       | [`docs/deployment/ci-pull-request.md`](./deployment/ci-pull-request.md)                                                                     |
| Despliegue a dev y secretos de Stripe    | [`docs/deployment/despliegue-dev.md`](./deployment/despliegue-dev.md)                                                                       |
| Migración y reinicio                     | [`docs/deployment/migracion-inicial-dev.md`](./deployment/migracion-inicial-dev.md)                                                         |
| Estrategia y casos de prueba             | [`docs/testing/estrategia-de-pruebas.md`](./testing/estrategia-de-pruebas.md), [`matriz-trazabilidad.md`](./testing/matriz-trazabilidad.md) |
| Backlog, épicas, historias y sprints     | [`docs/scrum/`](./scrum/)                                                                                                                   |
| Mapas de rutas y diseño del frontend     | `apps/web/docs/mapa-de-rutas.md`, `apps/web/docs/design-foundation.md`                                                                      |
| Cómo contribuir (ramas, commits, PR)     | [`CONTRIBUTING.md`](../CONTRIBUTING.md)                                                                                                     |

> Los datos reales de personas (DNI y correos del equipo) **no van al
> repositorio**: viven en `mock-data/local/` y `docs/local/`, ignoradas por git.
