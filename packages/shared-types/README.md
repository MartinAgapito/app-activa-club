# packages/shared-types

Contratos y tipos TypeScript compartidos entre `apps/web` y `apps/api`.

Este paquete extiende la configuración estricta compartida (`tsconfig.base.json`).
Aún no contiene tipos de dominio: solo el esqueleto del paquete. Los tipos reales
deben derivarse de contratos documentados en `docs/data/` y `docs/api/`, nunca
inventarse durante la implementación.
