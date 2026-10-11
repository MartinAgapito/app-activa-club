# US-051 — Consultar los socios y su situación de membresía

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-051                                     |
| Épica               | [EP-06](../epicas/EP-06-administracion.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Frontend                                   |
| Fase                | MVP                                        |
| Sprint              | Sprint 5                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 3                                          |
| Dependencias        | US-017 (servidor implementado)             |

## Historia

Como **administrador**, quiero **ver el padrón de socios por estado, buscar a un socio por su DNI y consultar su situación de membresía y deuda**, para **atender consultas en ventanilla y conocer la situación de cualquier socio sin recurrir al sistema anterior**.

## Contrato de API

Todo ya existe en el servidor, sin cambios:

- `GET /members?status=&cursor=&limit=` (admin): listado paginado por `memberStatus`; el filtro es obligatorio (US-017).
- `GET /members/{memberId}` (admin): detalle completo, con la membresía denormalizada.
- `GET /members/lookup?dni=` (member, admin): resuelve un `memberId` por DNI exacto (ADR-0009).

Pantalla existente como placeholder: `/admin/socios` (`MembersManagementPage`).

## Reglas de negocio

RN-ADM-01 (gestionar socios migrados y nuevos), RN-ADM-03 (consultar estados de membresía y deudas), RN-MIG-05 (identificador legado visible para trazabilidad).

## Valor de negocio

Hoy el administrador solo ve a los socios **pendientes de aprobación** (`/admin/solicitudes`). No tiene forma de responder "¿este socio está al día?" ni de ver a los socios migrados, que son la mayoría del padrón.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. En `/admin/socios` el administrador elige un estado de socio (migrado sin activar, pendiente, aprobado, rechazado, activo) y ve la lista paginada de ese estado, con nombre, DNI, origen (migrado o nuevo), estado de membresía y fecha de alta.
2. El administrador puede buscar por DNI exacto; si existe un socio resoluble, se abre su detalle directamente.
3. El detalle muestra: datos de contacto, origen, identificador legado (si es migrado), estado del socio, tipo de membresía, estado de membresía, fecha de vencimiento, días restantes, saldo pendiente en soles y si tiene la renovación automática autorizada.
4. Los estados se muestran con las etiquetas y colores del design foundation (por ejemplo, "Por vencer" en advertencia, "Con deuda" en error), nunca con el código crudo.
5. Desde el detalle se accede al historial de pagos de ese socio (US-053, filtrado por el socio).
6. Si el socio está `PENDING`, el detalle lleva a `/admin/solicitudes` para decidir; esta pantalla no duplica la aprobación ni el rechazo.
7. La pantalla es responsive, accesible y tiene estados de carga, error, vacío por estado ("no hay socios en este estado") y paginación con "cargar más".
8. Un `member` que navega a `/admin/socios` es redirigido (guard de rol existente).

## Casos alternativos / excepciones

- **Búsqueda por DNI de una solicitud pendiente o rechazada**: el endpoint de búsqueda responde 404 para esos estados (ADR-0009); la pantalla indica que no se encontró un socio y sugiere revisar el listado de pendientes o rechazados.
- **Buscar por nombre o por correo**: no existe patrón de acceso ni contrato; fuera de esta historia (pregunta abierta 2 de EP-06).
- **Editar datos del socio, suspenderlo o darlo de baja**: no está definido en el contrato ni en el Contexto Maestro; ver pregunta abierta 1 de EP-06.
- **Filtrar por situación de membresía** (con deuda, vencidos, por vencer): es US-052.

## Sugerencia de pruebas funcionales

- AD-01: listado por estado `MIGRATED` y `ACTIVE`.
- AD-02: detalle de un socio con deuda muestra el saldo y el estado "Con deuda".
- Búsqueda por DNI de un socio activo → abre el detalle; DNI inexistente → mensaje de no encontrado.
- T-06: acceso de un `member` a la ruta → redirección.

## Trazabilidad

- Épica: EP-06
- Reglas: RN-ADM-01, RN-ADM-03, RN-MIG-05.
- Casos de prueba: AD-01, AD-02 (por interfaz), T-06.
- Depende de: US-017 (listado y detalle en el servidor).
- Habilita: US-052, US-053.
