# Sprint 1 — Migración de socios, activación y acceso

| Campo             | Valor                                                     |
| ----------------- | --------------------------------------------------------- |
| Sprint            | 1                                                         |
| Nombre            | Migración de socios, activación y acceso                  |
| Épica             | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md)   |
| Fase              | MVP                                                       |
| Duración sugerida | 2 semanas                                                 |
| Estado            | Planificada                                               |

## Sprint Goal

Entregar el primer bloque funcional del MVP: migrar los socios del JSON on-premise hacia DynamoDB y habilitar la identidad y el acceso —activación con DNI, login, recuperación de contraseña, registro de socio nuevo con aprobación administrativa y perfil— de modo que existan cuentas digitales reales operables en el ambiente `dev`, base para las épicas de membresías/pagos y reservas.

## Alcance del sprint

Este sprint implementa exclusivamente lo clasificado como **MVP** en las secciones 1 (Migración on-premise) y 2 (Activación y registro) de `docs/product/matriz-de-alcance.md`. **Fuera de este sprint**: pagos vía Culqi (EP-03), reservas (EP-04), notificaciones como módulo propio (EP-05), administración avanzada, dashboards y analytics. Los eventos de notificación (`ACCOUNT_ACTIVATED`, `MEMBER_APPROVED`/`MEMBER_REJECTED`) se disparan según el contrato, sin construir el módulo de notificaciones.

## Sprint Backlog

| ID                                                                      | Título                                                 | Responsable        | Prioridad | Depende de     | Estimación |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ | --------- | -------------- | ---------- |
| [US-011](../historias/US-011-provisionar-endpoints-identidad-acceso.md) | Provisionar endpoints serverless de identidad y acceso | DevOps             | Crítica   | —              | 8          |
| [US-012](../historias/US-012-migracion-inicial-socios-dynamodb.md)      | Ejecutar la migración inicial de socios hacia DynamoDB | Backend            | Crítica   | US-011         | 8          |
| [US-013](../historias/US-013-activacion-cuenta-socio-dni.md)            | Activar cuenta de socio migrado con DNI                | Backend + Frontend | Alta      | US-011, US-012 | 8          |
| [US-014](../historias/US-014-login-correo-contrasena.md)                | Iniciar sesión con correo y contraseña                 | Frontend           | Alta      | —              | 3          |
| [US-015](../historias/US-015-recuperacion-contrasena.md)                | Recuperar contraseña                                   | Frontend           | Media     | US-014         | 3          |
| [US-016](../historias/US-016-registro-socio-nuevo.md)                   | Registrarse como socio nuevo                           | Backend + Frontend | Alta      | US-011         | 5          |
| [US-017](../historias/US-017-aprobacion-rechazo-socios.md)              | Aprobar o rechazar solicitudes de socios nuevos        | Backend + Frontend | Alta      | US-011, US-016 | 5          |
| [US-018](../historias/US-018-perfil-usuario.md)                         | Consultar y actualizar el perfil de usuario            | Backend + Frontend | Media     | US-011         | 5          |

Estimación total: 45 puntos relativos.

## Grafo de dependencias

```
(Sprint 0 base)
   ├──► US-011 ──► US-012 ──► US-013
   │          ├──► US-016 ──► US-017
   │          └──► US-018
   └──► US-014 ──► US-015
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (arranque, en paralelo):** US-011 (DevOps, infra de endpoints), US-014 (Frontend, login sobre Cognito de Sprint 0).
- **Ola 2 (tras US-011):** US-012 (Backend, migración), US-016 (registro), US-018 (perfil); en paralelo US-015 (Frontend, recuperación, tras US-014).
- **Ola 3 (cierre funcional):** US-013 (activación, requiere socios migrados de US-012), US-017 (aprobación, requiere socios pendientes de US-016).
- **Ola 4 (verificación extremo a extremo):** pruebas de los flujos completos migración → activación → login y registro → aprobación → login.

## Capacidad de trabajo paralelo

- Frontend arranca de inmediato con US-014 (login) usando el Cognito ya desplegado, sin esperar backend.
- DevOps desbloquea con US-011 todos los flujos con endpoint (migración, activación, registro, aprobación, perfil).
- Backend y Frontend avanzan en paralelo sobre los contratos ya definidos en `docs/api/contratos-api.md`; el contrato es la interfaz de sincronización.
- Los flujos de solo-Cognito (login, recuperación) no dependen del backend propio y pueden cerrarse temprano.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- La migración carga los socios del JSON en DynamoDB de forma idempotente y auditada, preservando identificador legado.
- Un socio migrado puede activar su cuenta con DNI e iniciar sesión.
- Un socio nuevo puede registrarse, quedar pendiente y ser aprobado o rechazado por un administrador.
- Un usuario puede recuperar su contraseña y consultar/actualizar su perfil.
- Las reglas críticas de unicidad, identidad y estado se validan en el backend.
- No se introdujo alcance fuera del MVP de las secciones 1 y 2 de la matriz de alcance.

## Ceremonias

- **Planning:** selección de US-011..US-018, confirmación del Sprint Goal y del alcance acotado a migración + identidad/acceso.
- **Daily:** foco en desbloquear la cadena US-011 → US-012 → US-013 y US-016 → US-017; sincronización de contratos entre Frontend y Backend.
- **Review:** demostración extremo a extremo de migración, activación, login, registro, aprobación y perfil en el ambiente `dev`.
- **Retrospective:** ajustes de proceso antes de EP-03 (membresías y pagos).

## Riesgos del sprint

| Riesgo                                                     | Impacto                                            | Mitigación                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Retraso de US-011 (infra de endpoints)                     | Alto: bloquea US-012, US-013, US-016, US-017, US-018 | Priorizar US-011 en Ola 1; usar stubs de Lambda para que Backend/Frontend integren en paralelo    |
| Ajustes del módulo `modules/endpoint` para path params/roles | Medio: retrasa el despliegue de endpoints           | Validar el módulo temprano; documentar cambios antes de aplicar                                    |
| Divergencia del JSON real respecto al contrato de entrada  | Medio: reproceso de la migración                    | Ajustar `mapeo-migracion.md` antes de implementar; no inventar campos; migración reejecutable      |
| Manejo de creación de usuario Cognito (activación/registro) | Medio: fallos de unicidad o de enlace `cognitoSub`  | Validar unicidad de DNI/correo en backend; transacciones idempotentes sobre claves `UNIQ#`         |
| Costos fuera de Free Tier al agregar API Gateway/Lambda    | Bajo-Medio: presupuesto                             | Dimensionar mínimo, sin recursos siempre-encendidos; revisar en el plan de Terraform               |
| Divergencia respecto al Contexto Maestro                   | Alto: retrabajo y scope creep                       | Toda historia deriva de la matriz de alcance MVP; validación contra el Contexto Maestro en planning |

## Historial de cambios

- 2026-07-16: Creación del Sprint 1 con las 8 historias de EP-02 (US-011..US-018).
