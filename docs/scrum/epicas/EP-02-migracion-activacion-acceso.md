# EP-02 — Migración de socios, activación y acceso

| Campo            | Valor       |
| ---------------- | ----------- |
| ID               | EP-02       |
| Tipo             | Épica       |
| Fase             | MVP         |
| Estado           | Planificada |
| Dependencias     | EP-01       |
| Sprint principal | Sprint 1    |

## Descripción

Entregar el primer bloque funcional de negocio de Activa Club: cargar la información inicial de socios desde el JSON on-premise hacia DynamoDB, permitir que un socio migrado active su cuenta digital con su DNI, y habilitar el acceso al sistema (login, recuperación de contraseña, registro de socio nuevo con aprobación administrativa y gestión de perfil). Esta épica convierte la data legada y las nuevas solicitudes en cuentas digitales operables, sentando la identidad sobre la que se apoyarán las épicas de membresías/pagos, reservas y notificaciones.

## Valor de negocio

Sin migración e identidad no hay usuarios que puedan operar el sistema: ningún socio puede iniciar sesión, pagar ni reservar. EP-02 habilita la puerta de entrada del producto —"un DNI, una cuenta digital"— preservando la trazabilidad hacia el sistema legado (identificador legado) y garantizando que las reglas críticas de unicidad y estado vivan en el backend. Es el primer entregable que demuestra el objetivo del proyecto: migrar información on-premise a AWS y habilitar una experiencia digital para el socio.

## Objetivos de la épica

- Infraestructura de endpoints serverless (API Gateway + Lambda) provisionada en Terraform para los flujos de identidad y acceso.
- Migración inicial de socios, membresías, saldo pendiente resumido y estado legado desde el JSON on-premise hacia DynamoDB, idempotente y auditada.
- Activación de cuenta de socio migrado mediante DNI, con creación de usuario Cognito y enlace al socio.
- Login con correo y contraseña vía Amazon Cognito.
- Recuperación de contraseña autoservicio.
- Registro de socio nuevo en estado pendiente y aprobación/rechazo administrativo.
- Consulta y actualización de perfil de usuario.

## Historias asociadas

| ID                                                                    | Título                                                        | Responsable        | Depende de     |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ | -------------- |
| [US-011](../historias/US-011-provisionar-endpoints-identidad-acceso.md) | Provisionar endpoints serverless de identidad y acceso       | DevOps             | —              |
| [US-012](../historias/US-012-migracion-inicial-socios-dynamodb.md)      | Ejecutar la migración inicial de socios hacia DynamoDB       | Backend            | US-011         |
| [US-013](../historias/US-013-activacion-cuenta-socio-dni.md)            | Activar cuenta de socio migrado con DNI                      | Backend + Frontend | US-011, US-012 |
| [US-014](../historias/US-014-login-correo-contrasena.md)                | Iniciar sesión con correo y contraseña                       | Frontend           | —              |
| [US-015](../historias/US-015-recuperacion-contrasena.md)                | Recuperar contraseña                                         | Frontend           | US-014         |
| [US-016](../historias/US-016-registro-socio-nuevo.md)                   | Registrarse como socio nuevo                                 | Backend + Frontend | US-011         |
| [US-017](../historias/US-017-aprobacion-rechazo-socios.md)              | Aprobar o rechazar solicitudes de socios nuevos              | Backend + Frontend | US-011, US-016 |
| [US-018](../historias/US-018-perfil-usuario.md)                         | Consultar y actualizar el perfil de usuario                  | Backend + Frontend | US-011         |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- La migración carga los socios del JSON on-premise en DynamoDB preservando membresía, saldo pendiente resumido, estado legado e identificador legado, y es reejecutable sin duplicar socios.
- Un socio migrado puede activar su cuenta con su DNI (un DNI, una cuenta digital) e iniciar sesión con correo y contraseña.
- Una persona no migrada puede registrarse, quedar pendiente y ser aprobada o rechazada por un administrador.
- Un usuario autenticado puede recuperar su contraseña y consultar/actualizar su perfil.
- Todas las reglas críticas de unicidad, identidad y estado se validan en el backend, nunca solo en el frontend.
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance (secciones 1 y 2).

## Alcance explícitamente fuera de EP-02 (épicas posteriores)

Estos bloques MVP se planificarán en sprints/épicas siguientes y no forman parte de EP-02:

- Membresías y pagos vía Culqi sandbox (EP-03).
- Reservas de instalaciones (EP-04).
- Notificaciones internas y correos transaccionales como funcionalidad propia (EP-05); en EP-02 solo se disparan los eventos de activación/aprobación previstos por los contratos, sin construir el módulo de notificaciones.
- Administración avanzada, dashboards y analytics (EP-06, EP-07).

## Historial de cambios

- 2026-07-16: Creación de la épica EP-02 y asociación de las historias del Sprint 1 (US-001, US-011..US-018).
