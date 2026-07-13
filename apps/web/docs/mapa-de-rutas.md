# Mapa de rutas — Activa Club (Frontend)

> Entregable de [US-008](../../../docs/scrum/historias/US-008-mapa-rutas-design-foundation.md)
> (Sprint 0, fundación). Deriva de la [visión y objetivos](../../../docs/product/vision-y-objetivos.md),
> las [reglas de negocio](../../../docs/product/reglas-de-negocio.md) y los
> [contratos de API](../../../docs/api/contratos-api.md). No implementa
> funcionalidad de negocio: solo estructura de navegación, guards de acceso por
> rol y placeholders. La implementación real de cada pantalla es de Sprint 1+.

## 1. Decisión de enrutamiento

Se usa **React Router** (`react-router-dom` v7, modo _data router_ con
`createBrowserRouter`/`RouterProvider`) como librería de enrutamiento del
cliente.

- No estaba fijado en el stack obligatorio, por lo que se documenta aquí la
  decisión (equivalente a un ADR de frontend, sin crear un ADR formal en
  `docs/architecture/adr/` porque esa carpeta está reservada a decisiones de
  arquitectura transversal a cargo del Arquitecto — ver
  `docs/architecture/adr/README.md`).
- **Alternativas consideradas:**
  - _TanStack Router_: type-safety de rutas superior, pero es una librería más
    nueva, con menor tamaño de comunidad/ejemplos y una curva de adopción
    mayor para un equipo que recién arranca el MVP. Se descarta por
    simplicidad, priorizando entrega del MVP (principio "bajo costo y
    simplicidad" del Contexto Maestro).
  - _Enrutamiento manual (estado + switch)_: insuficiente para guards
    anidados por rol, rutas protegidas y estados de carga por ruta.
- **Por qué React Router**: es el estándar de facto para SPA con Vite, soporta
  rutas anidadas con layouts compartidos (`Outlet`), guards vía componentes
  envolventes (`RequireRole`) y `loader`/`action` para Sprint 1 si se
  requieren. Buena documentación y comunidad, sin dependencias adicionales de
  build.

## 2. Modelo de guard de rutas (UX, no seguridad)

Según [ADR-0002](../../../docs/architecture/adr/ADR-0002-autenticacion-cognito-roles.md):

> "guarda de rutas por rol como UX, no como control de seguridad".

- `RequireRole` (`src/routes/guards/RequireRole.tsx`) redirige a `/login` si
  no hay sesión, o a `/403` si el rol autenticado no está en la lista
  permitida. **Es solo experiencia de usuario**: la autorización real siempre
  la valida el backend (API Gateway Cognito Authorizer + Lambda), que revisa
  el claim `cognito:groups` del JWT.
- El contexto de sesión (`src/auth/AuthContext.tsx`) es un **placeholder de
  fundación**: expone sesión anónima por defecto y no integra Cognito
  todavía (login/refresh/logout). La integración real es de Sprint 1, sobre
  la misma interfaz (`useAuth()`), sin tener que reescribir los guards ni las
  páginas.
- Un guard adicional por **estado del socio** (`memberStatus`,
  `membershipStatus`, `canReserve`) no está implementado en Sprint 0: se
  documenta como pendiente en la tabla de rutas de socio (columna "Notas") y
  se resuelve en Sprint 1 cuando el layout de socio consuma `GET /members/me`
  o `GET /dashboard/member`.

## 3. Rutas públicas (sin autenticación)

| Ruta                  | Página                  | Contrato relacionado                                   | Notas                                                                                   |
| --------------------- | ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `/`                   | Inicio institucional    | — (contenido estático)                                 | Único contenido "terminado" del Sprint 0: copy institucional, sin datos ni formularios. |
| `/login`              | Iniciar sesión          | Cognito `InitiateAuth` (`USER_PASSWORD_AUTH`)          | RN-ACT-04. Placeholder "en construcción".                                               |
| `/activar-cuenta`     | Activar cuenta con DNI  | `POST /activation/verify`, `POST /activation/complete` | RN-ACT-01/02/03. Placeholder.                                                           |
| `/registro`           | Registro de socio nuevo | `POST /registration`                                   | RN-ACT-05/06. Placeholder.                                                              |
| `/recuperar-password` | Recuperar contraseña    | Cognito `ForgotPassword` + `ConfirmForgotPassword`     | Placeholder.                                                                            |
| `/verificar-correo`   | Verificar correo        | Cognito (confirmación de atributo email)               | Placeholder.                                                                            |
| `/403`                | Sin permisos            | —                                                      | Estado "sin permisos" cuando el rol no coincide.                                        |
| `*`                   | No encontrado           | —                                                      | Catch-all 404.                                                                          |

## 4. Rutas de socio (`member`)

Layout compartido: `MemberLayout` (navegación de sección + botón de cerrar
sesión). Guard: `RequireRole allow={['member']}`.

| Ruta                    | Página                                  | Contrato relacionado                                                                                                              | Notas                                                               |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/socio`                | Home / dashboard personal               | `GET /dashboard/member`                                                                                                           | Incluye `canReserve`, alertas y próximas reservas.                  |
| `/socio/membresia`      | Estado de membresía                     | `GET /members/me`, `PATCH /members/me/auto-renew`                                                                                 | RN-PAG-01..03.                                                      |
| `/socio/pagos`          | Pagos y renovación                      | `GET /memberships/plans`, `POST /payments`, `GET /payments`                                                                       | RN-PAG-04/07/08. Nunca se procesan datos de tarjeta en el frontend. |
| `/socio/reservas`       | Reservas y calendario de disponibilidad | `GET /resources`, `GET /resources/{id}/availability`, `POST /reservations`, `GET /reservations`, `POST /reservations/{id}/cancel` | RN-RES-01..12. Ver §6 (restricción por deuda).                      |
| `/socio/notificaciones` | Notificaciones                          | `GET /notifications`, `POST /notifications/{id}/read`                                                                             | RN-NOT-01.                                                          |
| `/socio/perfil`         | Perfil                                  | `GET /members/me`, `PATCH /members/me`                                                                                            | —                                                                   |

**Nota de alcance — "Invitados y otros socios participantes":** no es una
ruta propia porque el contrato no expone un endpoint independiente para
"mis invitados"; los participantes (otros socios e invitados externos) se
agregan como parte del body de `POST /reservations`
(`participants: [{ type: 'MEMBER' | 'GUEST', ... }]`, RN-RES-03/04/05). En
Sprint 1 esto se resuelve como una sub-vista dentro del flujo de creación de
`/socio/reservas`, no como una ruta de nivel superior.

### 4.1 Estado transicional: solicitud pendiente

| Ruta                           | Página                | Notas                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/cuenta/pendiente-aprobacion` | Solicitud en revisión | RN-ACT-06/07. Un socio nuevo (`origin=NEW`) puede autenticarse (Cognito lo crea en el grupo `member` desde el registro) pero su `memberStatus` es `PENDING`/`APPROVED` sin pagar. Debe ver esta pantalla en vez del dashboard, sin poder reservar. |

En Sprint 0 esta ruta ya existe con el guard de rol `member`, pero la
**redirección automática** desde `/socio` cuando `memberStatus !== 'ACTIVE'`
no está implementada (requiere `GET /members/me`); queda documentada como
dependencia de Sprint 1.

## 5. Rutas de administración (`admin`)

Layout compartido: `AdminLayout`. Guard: `RequireRole allow={['admin']}`.

| Ruta                    | Página                   | Contrato relacionado                                                                     | Notas                            |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `/admin`                | Dashboard administrativo | `GET /dashboard/admin`                                                                   | RN-ANL-01..08.                   |
| `/admin/socios`         | Gestión de socios        | `GET /members`, `GET /members/{id}`                                                      | RN-ADM-01/03.                    |
| `/admin/solicitudes`    | Solicitudes pendientes   | `GET /members?status=PENDING`, `POST /members/{id}/approve`, `POST /members/{id}/reject` | RN-ACT-06, RN-ADM-02.            |
| `/admin/membresias`     | Membresías y pagos       | `GET /memberships/plans`, `GET /payments`, `GET /payments/{id}`                          | RN-ADM-07.                       |
| `/admin/reservas`       | Reservas y aprobaciones  | `GET /reservations?scope=all`, `POST /reservations/{id}/approve                          | reject`                          | RN-RES-02, RN-ADM-05. |
| `/admin/recursos`       | Recursos y mantenimiento | `GET /resources`, `PATCH /resources/{id}`, `POST/DELETE /resources/{id}/maintenance`     | RN-RES-11, RN-ADM-04.            |
| `/admin/notificaciones` | Notificaciones           | `POST /notifications`, `GET /notifications/sent`                                         | RN-NOT-03/04, RN-ADM-06.         |
| `/admin/analytics`      | Analytics                | `GET /dashboard/admin`                                                                   | RN-ANL-01..08 (vista extendida). |

La historia de usuario también menciona "Gestión de socios" y "Solicitudes
pendientes" como áreas separadas; ambas consumen la misma familia de
endpoints `GET /members*` con filtros distintos, por eso se documentan como
rutas independientes (`/admin/socios` vs `/admin/solicitudes`) aunque
compartan contrato.

## 6. Restricción funcional clave: deuda/vencimiento y reservas

Regla: **RN-PAG-06 / RN-RES-12** — un socio con deuda o membresía vencida
puede iniciar sesión y pagar, pero no puede reservar. El contrato expone esto
vía `canReserve` en `GET /dashboard/member`.

- `/socio/reservas` (placeholder de Sprint 0) incluye un bloque **ilustrativo
  y estático** (sin datos reales ni llamadas a la API) que documenta el
  patrón esperado: cuando `canReserve` sea `false`, la pantalla debe bloquear
  la creación de reservas y dirigir con un enlace claro a `/socio/pagos`, en
  vez de permitir reservar. Ver `src/pages/member/ReservationsPage.tsx`.
- La implementación real (consumir `canReserve`, deshabilitar el flujo de
  reserva, banner de deuda) es de Sprint 1.

## 7. Herramientas internas de desarrollo (fuera del mapa de rutas del MVP)

| Ruta                  | Página                      | Notas                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_dev/design-system` | Referencia de design system | Solo existe cuando `import.meta.env.DEV` es verdadero (se elimina del bundle de producción). Muestra los componentes de `@activa-club/ui`, el formulario de referencia (React Hook Form + Zod) y la demo de TanStack Query sobre datos simulados. No es una pantalla de negocio ni cuenta como parte del mapa de rutas del MVP (criterio de aceptación 7 de US-008: sin llamadas reales a la API). |

## 8. Resumen de árbol de rutas

```
/                              público   Inicio institucional
/login                         público   Login (Cognito)
/activar-cuenta                público   Activación con DNI
/registro                      público   Registro de socio nuevo
/recuperar-password            público   Recuperación de contraseña
/verificar-correo              público   Verificación de correo

/cuenta/pendiente-aprobacion   member    Estado de espera (RN-ACT-06/07)

/socio                         member    Home / dashboard
/socio/membresia               member    Estado de membresía
/socio/pagos                   member    Pagos y renovación
/socio/reservas                member    Reservas (incluye participantes/invitados en el flujo)
/socio/notificaciones          member    Notificaciones
/socio/perfil                  member    Perfil

/admin                         admin     Dashboard administrativo
/admin/socios                  admin     Gestión de socios
/admin/solicitudes             admin     Solicitudes pendientes
/admin/membresias              admin     Membresías y pagos
/admin/reservas                admin     Reservas y aprobaciones
/admin/recursos                admin     Recursos y mantenimiento
/admin/notificaciones          admin     Notificaciones
/admin/analytics               admin     Analytics

/403                           —         Sin permisos
*                               —         No encontrado

/_dev/design-system             (solo DEV) Referencia interna, fuera del MVP
```

## 9. Historial de cambios

- 2026-07-10: Versión inicial (US-008, Sprint 0).
