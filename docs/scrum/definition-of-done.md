# Definition of Done (DoD) — Activa Club

> Una historia solo se considera terminada cuando cumple todos los criterios aplicables. La DoD es el contrato de calidad transversal del equipo.

## DoD general

Una historia está **terminada** cuando:

1. Todos los criterios de aceptación se cumplen y son verificables.
2. La trazabilidad épica → historia → criterios → pruebas → Pull Request está completa.
3. El código o entregable respeta el Contexto Maestro y las normas de ingeniería acordadas.
4. Las reglas críticas de negocio se validan en el backend, no solo en el frontend.
5. Existe cobertura de pruebas acorde a la estrategia de QA (unitarias, integración o E2E según corresponda).
6. Pasa el CI de calidad: lint (ESLint), formato (Prettier), TypeScript estricto y pruebas.
7. Los commits siguen Conventional Commits.
8. El cambio se integra vía Pull Request revisado y aprobado según el gobierno Git.
9. La documentación afectada (producto, arquitectura, API, datos, testing) queda actualizada.
10. No introduce secretos, contraseñas ni datos sensibles en el repositorio ni en la base de datos.

## DoD específica para historias de documentación / fundación (Sprint 0)

Una historia de tipo documental o de fundación técnica está **terminada** cuando:

1. El entregable (documento, estructura, pipeline, plantilla o base de infraestructura) existe en el directorio acordado.
2. Es consistente con el Contexto Maestro y no lo contradice.
3. Es comprensible para todos los agentes que dependen de él.
4. Sus dependientes (historias que lo consumen) tienen la información suficiente para arrancar.
5. Está referenciado desde el índice o backlog correspondiente para su descubrimiento.
6. No introduce funcionalidad de negocio (el Sprint 0 es solo fundación).
