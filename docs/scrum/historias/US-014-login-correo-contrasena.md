# US-014 — Iniciar sesión con correo y contraseña

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-014                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Frontend                                                |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Alta                                                    |
| Estimación relativa | 3                                                       |
| Dependencias        | —                                                       |

## Historia

Como **usuario de Activa Club (socio o administrador)**, quiero **iniciar sesión con mi correo y contraseña**, para **acceder a las funciones que me corresponden según mi rol**.

## Contrato de API

Autenticación directa con Cognito (sin endpoint propio): `InitiateAuth` (`USER_PASSWORD_AUTH`) y `REFRESH_TOKEN_AUTH`, según `docs/api/contratos-api.md` §2. El rol proviene del claim `cognito:groups` (`member` | `admin`).

## Reglas de negocio

RN-ACT-04 (el inicio de sesión se realiza con correo electrónico y contraseña), RN-PAG-06 (un socio con deuda o membresía vencida puede iniciar sesión, pero no reservar).

## Valor de negocio

El login es la puerta de acceso al sistema para toda cuenta ya creada (migrada, activada o registrada). Sin él, ninguna funcionalidad autenticada es utilizable.

## Precondiciones

- Existe una cuenta Cognito válida (creada por activación US-013 o registro US-016).

## Postcondiciones

- El usuario obtiene tokens de sesión (ID/Access/Refresh) y es dirigido a la vista correspondiente a su rol.

## Criterios de aceptación

1. Con correo y contraseña correctos, el usuario inicia sesión y obtiene una sesión activa mediante Cognito.
2. El rol (`member` / `admin`) se resuelve desde el claim `cognito:groups` y determina la navegación disponible.
3. Con credenciales incorrectas, se muestra un mensaje de error genérico sin revelar si el correo existe.
4. La sesión se refresca con el refresh token sin re-solicitar credenciales mientras siga vigente.
5. El cierre de sesión descarta los tokens y redirige a la pantalla de acceso.
6. Un socio con deuda o membresía vencida puede iniciar sesión con normalidad (las restricciones de reserva pertenecen a EP-03/EP-04).
7. Las contraseñas nunca se almacenan ni registran en el cliente o backend propio; las gestiona Cognito.
8. El formulario es responsive, accesible y con estados de carga y error.

## Casos alternativos / excepciones

- Usuario no confirmado o sin cuenta: mensaje que orienta a activar (US-013) o registrarse (US-016).
- Bloqueo temporal por intentos fallidos según la política de Cognito: se comunica al usuario.

## Sugerencia de pruebas funcionales

- Credenciales válidas de `member` → acceso a vista de socio.
- Credenciales válidas de `admin` → acceso a vista de administrador.
- Credenciales inválidas → error genérico.
- Refresh de sesión vigente → sin re-login.
- Logout → tokens descartados.

## Trazabilidad

- Épica: EP-02
- Depende de: — (Cognito disponible desde Sprint 0). Para verificación extremo a extremo requiere cuentas de US-013 o US-016.
- Habilita: US-015 (recuperación), US-018 (perfil) y toda vista autenticada.
