# US-015 — Recuperar contraseña

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-015                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Frontend                                                |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Media                                                   |
| Estimación relativa | 3                                                       |
| Dependencias        | US-014                                                  |

## Historia

Como **usuario de Activa Club**, quiero **recuperar el acceso a mi cuenta cuando olvide mi contraseña**, para **volver a iniciar sesión sin depender de un administrador**.

## Contrato de API

Recuperación directa con Cognito (sin endpoint propio): `ForgotPassword` + `ConfirmForgotPassword`, según `docs/api/contratos-api.md` §2. El correo de código lo entrega Cognito/SES.

## Reglas de negocio

RN-ACT-04 (acceso con correo y contraseña); RN-PAG-08 / normas de ingeniería (nunca se almacenan contraseñas).

## Valor de negocio

La recuperación autoservicio reduce fricción y carga administrativa, y evita que un socio quede sin acceso por olvido de contraseña.

## Precondiciones

- Existe una cuenta Cognito asociada al correo.

## Postcondiciones

- La contraseña del usuario queda actualizada en Cognito y puede iniciar sesión con la nueva.

## Criterios de aceptación

1. Al solicitar recuperación con un correo, Cognito envía un código de verificación al correo si la cuenta existe.
2. Por seguridad, la interfaz muestra el mismo mensaje exista o no la cuenta, sin revelar su existencia.
3. Con el código válido y una nueva contraseña que cumpla la política, la contraseña se actualiza y el usuario puede iniciar sesión (US-014).
4. Un código inválido o vencido muestra un error claro y permite reintentar o reenviar.
5. Una nueva contraseña que no cumple la política muestra el detalle de los requisitos.
6. La contraseña nunca se almacena ni registra fuera de Cognito.
7. El flujo es responsive, accesible y con estados de carga y error.

## Casos alternativos / excepciones

- Reenvío de código: se permite solicitar uno nuevo respetando los límites de Cognito.
- Exceso de intentos: se comunica el límite temporal impuesto por Cognito.

## Sugerencia de pruebas funcionales

- Correo existente → código recibido → cambio de contraseña → login con nueva.
- Correo inexistente → mismo mensaje neutro, sin fuga de información.
- Código inválido/vencido → error y reintento.
- Nueva contraseña débil → error de política.

## Trazabilidad

- Épica: EP-02
- Depende de: US-014 (pantalla de acceso y cuentas existentes).
- Habilita: continuidad de acceso de usuarios existentes.
