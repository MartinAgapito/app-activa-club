# ADR-0002 — Autenticación con Cognito y roles member/admin

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002

## Contexto

El sistema autentica con correo y contraseña (RN-ACT-04) y define dos roles
iniciales, `member` y `admin`, con evolución prevista a múltiples
administradores. Nunca deben guardarse contraseñas en la base de datos. La
autorización de reglas críticas no puede depender del frontend.

## Decisión

Se usa **Amazon Cognito User Pool** como proveedor de identidad.

- **Un solo User Pool** con login por correo+contraseña. Cognito gestiona
  hashing de contraseñas, verificación de correo, recuperación de contraseña
  (`ForgotPassword`) y emisión de **JWT** (ID/Access token).
- **Roles como grupos de Cognito**: `member` y `admin`. El claim
  `cognito:groups` viaja en el token y determina el rol. Modelar el rol como
  grupo (no como valor hardcodeado) permite **agregar múltiples administradores**
  simplemente asignando usuarios al grupo `admin`, sin cambios de esquema.
- **API Gateway Cognito Authorizer** valida el JWT en el borde; cada Lambda
  recibe el `sub` y los grupos ya verificados y aplica autorización por rol.
- **Enlace identidad–dominio**: el `sub` de Cognito se guarda como `cognitoSub`
  en el item `Member` de DynamoDB y se indexa (GSI1) para resolver
  `cognitoSub → memberId` tras el login. La contraseña vive solo en Cognito.
- **Registro/activación**: el backend crea el usuario en Cognito vía Admin API
  (activación de socio migrado y registro de socio nuevo), controlando el estado
  del socio en DynamoDB (`PENDING`, `ACTIVE`, etc.) de forma independiente al
  estado de Cognito.

## Alternativas consideradas

- **Auth propia (JWT + bcrypt en Lambda/DynamoDB)**: obliga a almacenar y rotar
  hashes de contraseña, implementar recuperación y verificación de correo.
  Rechazada por costo de seguridad y mantenimiento; además viola la simplicidad
  buscada.
- **Rol como atributo en DynamoDB únicamente**: requeriría un lookup adicional en
  cada request para autorizar y no se validaría en el borde. Rechazada; el grupo
  de Cognito viaja firmado en el token.
- **Un User Pool por rol**: complica el login y la evolución. Rechazada.

## Consecuencias

- **Positivas**: seguridad gestionada por AWS; sin contraseñas en DynamoDB;
  autorización verificable en el borde; evolución a multi-admin sin migración.
- **Negativas**: dependencia de la Admin API de Cognito para el alta de usuarios;
  hay dos fuentes de estado (Cognito para credenciales, DynamoDB para el dominio)
  que deben mantenerse coherentes en los flujos de activación/registro.
- **Impacto**:
  - *Backend (US-009)*: middleware que extrae `sub`/grupos del authorizer y
    resuelve el socio; funciones de activación/registro usan Admin API.
  - *Frontend (US-008)*: login/refresh/logout contra Cognito (Amplify o SDK);
    guarda de rutas por rol como UX, no como control de seguridad.
  - *Terraform (US-004)*: User Pool, grupos `member`/`admin`, App Client,
    Authorizer de API Gateway.
  - *Security (docs/security)*: matriz de permisos por rol y endpoint.
