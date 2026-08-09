# ADR-0010 — Catálogo de recursos como datos de infraestructura (Terraform)

- **Estado**: Aceptado
- **Fecha**: 2026-08-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-028 (y US-036 para la edición en runtime); decisión
  pendiente 2 de [EP-04](../../scrum/epicas/EP-04-reservas-instalaciones.md)

## Contexto

El catálogo de instalaciones (`Resource`, modelo §3.7) es el dato maestro de
EP-04: sin él no hay disponibilidad que calcular ni reserva que crear. Son
**diez recursos fijos** que corresponden a instalaciones físicas del club
(dos canchas de fútbol, dos de tenis, dos de pádel, una piscina, dos zonas de
parrillas y un salón social) y que casi nunca cambian.

El contrato **no define ningún endpoint de creación de recursos** (solo
`PATCH /resources/{resourceId}` para que el administrador ajuste aforo, horario
y estado) y la migración on-premise solo trae socios (RN-MIG-03). Faltaba
decidir el mecanismo de carga: US-028 exige que el catálogo **exista, sea
idempotente y no se pierda al redesplegar**, en `dev` y en `prd`.

## Decisión

El catálogo se gestiona como **ítems estáticos de Terraform**: un recurso
`aws_dynamodb_table_item` por instalación, versionado junto con el resto de la
infraestructura y aplicado por el mismo pipeline (PR + `apply`). **No** se crea
un endpoint de alta, ni una Lambda de _seed_, ni un script manual.

### Propiedad de cada campo (quién manda sobre qué)

Es la parte que evita el conflicto entre "Terraform manda" y "el administrador
edita en runtime" (RN-ADM-04, US-036):

| Campo              | Fuente de verdad      | Cómo se cambia                                                  |
| ------------------ | --------------------- | --------------------------------------------------------------- |
| `resourceId`       | Terraform (inmutable) | Solo creando/eliminando el recurso en Terraform                 |
| `type`             | Terraform             | PR + `apply` con reemplazo del ítem                             |
| `name`             | Terraform             | PR + `apply` con reemplazo del ítem                             |
| `blockMinutes`     | Terraform             | PR + `apply` con reemplazo del ítem (cambia una regla RN-RES)   |
| `requiresApproval` | Terraform             | PR + `apply` con reemplazo del ítem (cambia RN-RES-01/02)       |
| `capacity`         | **Runtime (`admin`)** | `PATCH /resources/{resourceId}`; Terraform solo fija el inicial |
| `opensAt`          | **Runtime (`admin`)** | `PATCH /resources/{resourceId}`; Terraform solo fija el inicial |
| `closesAt`         | **Runtime (`admin`)** | `PATCH /resources/{resourceId}`; Terraform solo fija el inicial |
| `resourceStatus`   | **Runtime (`admin`)** | `PATCH /resources/{resourceId}`; Terraform lo crea `AVAILABLE`  |

Mecánica: cada `aws_dynamodb_table_item` lleva
`lifecycle { ignore_changes = [item] }`. Con eso Terraform **crea** el ítem si
falta y **nunca lo sobrescribe** después, así que un `apply` posterior no
revierte un cambio de aforo, horario o estado hecho por el administrador
(criterio 2 de idempotencia de US-028). Si el ítem se borra de la tabla,
el siguiente `plan` lo detecta ausente y lo vuelve a crear con sus valores
originales.

Vía de escape para los campos de Terraform: cambiar `blockMinutes`,
`requiresApproval`, `type` o `name` de un recurso ya desplegado exige forzar el
reemplazo del ítem
(`terraform apply -replace='module.resource_catalog.aws_dynamodb_table_item.resource["futbol-1"]'`),
lo que **restablece también los campos de runtime de ese recurso** a los valores
del catálogo. Es aceptable porque cambiar la duración de bloque o la exigencia
de aprobación es cambiar una regla de negocio (RN-RES-01/02), no una operación
del día a día, y debe pasar por revisión igual que cualquier cambio de reglas.

Los diez recursos se definen **una sola vez** (un módulo o un `locals`
compartido con `for_each`) y se instancian desde `environments/dev` y
`environments/prd`, para que ambos ambientes no diverjan.

## Alternativas consideradas

- **Lambda de _seed_ invocada manualmente o al desplegar.** Rechazada: agrega
  una función, un rol IAM y un paso operativo que hay que recordar ejecutar,
  para escribir diez ítems que no cambian. El catálogo dejaría de estar
  versionado como el resto de la infraestructura y podría diferir entre `dev` y
  `prd` sin que nadie lo note.
- **Endpoint `POST /resources` de alta administrativa.** Rechazada: no está en
  el contrato ni en la matriz de alcance, y abre una superficie de escritura
  administrativa para un dato que en el MVP es fijo. Además el catálogo dejaría
  de ser reproducible: montar un ambiente nuevo exigiría diez llamadas manuales.
- **Extender la migración desde el JSON de S3 para incluir recursos.**
  Rechazada: RN-MIG-03 define la migración como migración de **socios**; mezclar
  dato maestro de instalaciones en ese flujo confunde dos cosas distintas y
  ata la existencia del catálogo a que alguien ejecute
  `POST /admin/migration/run`.
- **Constantes en el código de las Lambdas.** Rechazada explícitamente por el
  criterio 10 de US-028: el aforo y el horario deben poder editarse sin
  desplegar (RN-ADM-04), y el frontend debe consumirlos desde la API.
- **`aws_dynamodb_table_item` sin `ignore_changes`.** Rechazada: Terraform
  detectaría como _drift_ cada edición legítima del administrador y la
  revertiría en el siguiente `apply`, rompiendo el criterio 4 de US-036.

## Consecuencias

- **Positivas**: catálogo versionado, revisable en PR y reproducible en
  cualquier ambiente nuevo con un solo `apply`; idempotente por construcción
  (Terraform lo lleva en su estado); cero código nuevo y cero costo adicional;
  las ediciones del administrador sobreviven a los despliegues.
- **Negativas**: agregar o quitar una instalación deja de ser una acción de
  producto y pasa a ser un PR de infraestructura; los campos "de Terraform" no
  se pueden ajustar en caliente.
- **Riesgo y mitigación**: el rol de despliegue de CI **hoy no tiene permisos
  de escritura de ítems** sobre la tabla de la aplicación (`bootstrap` solo le
  concede `GetItem`/`PutItem`/`DeleteItem` sobre la tabla de _locks_ de
  Terraform y operaciones de nivel tabla sobre `activa-club-dev`). Sin agregar
  `dynamodb:PutItem`, `dynamodb:GetItem` y `dynamodb:DeleteItem` sobre
  `activa-club-<env>` al rol de deploy —y `dynamodb:GetItem` al rol de solo
  lectura que corre el `plan`, que necesita leer el ítem para refrescar el
  estado— el pipeline falla con `AccessDenied`. `bootstrap` debe aplicarse con
  credenciales elevadas **antes** de mergear el PR de US-028, igual que en los
  Sprints 1 y 2.
- **Impacto**:
  - _Terraform (US-028, con base en US-027)_: diez `aws_dynamodb_table_item`
    definidos una vez y usados por ambos ambientes.
  - _Backend (US-028)_: `GET /resources` es una lectura del catálogo en
    DynamoDB; no hay lógica de _seed_ que implementar.
  - _Frontend_: sin impacto; consume aforo, horario y duración desde la API.
  - _DevOps_: procedimiento de `bootstrap` previo (ver riesgo) y documentación
    de que agregar/quitar recursos es un PR de infraestructura.
  - _QA_: verificar que tras un segundo `apply` siguen existiendo diez recursos
    y que una edición de aforo hecha por `admin` no se revierte.
