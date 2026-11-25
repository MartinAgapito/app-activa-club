# Pruebas con usuarios reales (QA)

Los socios de prueba migrados tienen correos ficticios (`...prueba@example.com`),
así que **nadie recibe sus correos**. Para probar escenarios reales (activación,
avisos de reserva, vencimiento de membresía) QA cambia el correo del socio por
uno propio con `scripts/qa-set-email.mjs`.

## Qué cambia el script

| Dónde    | Qué                                                                          |
| -------- | ---------------------------------------------------------------------------- |
| DynamoDB | `Member.email` y el ítem de unicidad del correo                              |
| Cognito  | Correo de acceso (solo si el socio ya activó; la contraseña no cambia)       |
| SES      | Envía a QA el correo de verificación (modo pruebas: solo recibe verificados) |

Nunca toca al administrador. Sin `--apply` solo simula.

## Pasos

Requiere AWS CLI con el perfil `activa-club-dev` (lo corre quien prepara el entorno).

1. Ver los socios disponibles:
   `node scripts/qa-set-email.mjs --list`
2. Simular el cambio (no modifica nada):
   `node scripts/qa-set-email.mjs --dni 10000002 --email qa+luis@gmail.com`
3. Aplicarlo:
   `node scripts/qa-set-email.mjs --dni 10000002 --email qa+luis@gmail.com --apply`
4. QA abre el correo de verificación de AWS SES y pulsa el enlace (**caduca en
   24 horas**; si caduca, repetir el paso 3 con el mismo correo).
5. Socio **sin activar**: QA activa la cuenta en `/activar-cuenta` con el DNI y el
   correo nuevo. Socio **ya activado**: inicia sesión con el correo nuevo y su
   contraseña de siempre.

## Consejos

- Con Gmail, `qa+luis@gmail.com`, `qa+carla@gmail.com`, etc. llegan al mismo
  buzón y cuentan como correos distintos: un buzón sirve para todos los socios.
  Cada alias debe verificarse en SES una vez.
- Un correo no puede estar en dos socios (error "ya lo usa otro socio").
- Para volver a empezar desde cero: `scripts/dev-reset.mjs` y nueva migración
  (guía paso a paso, sección 7).
