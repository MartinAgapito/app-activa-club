# mock-data

Archivo(s) JSON que representan el sistema on-premise de Activa Club, usados
como fuente para la migración inicial hacia Amazon DynamoDB (ver
`docs/product/contexto-maestro.md`, sección "Migración on-premise").

Contenido:

- `legacy-export.json`: datos **ficticios** de socios para la carga inicial en
  `dev`. Se sube tal cual al bucket de migración (ADR-0005) con ese nombre.
  Un caso por socio (activo, con deuda, por vencer, vencido y un registro
  inválido sin correo).
- `migration-run.test-event.json`: evento de prueba para disparar la migración
  desde la consola de Lambda.

El procedimiento completo está en
[`docs/deployment/migracion-inicial-dev.md`](../docs/deployment/migracion-inicial-dev.md).
Los tests usan el fixture
`apps/api/src/migration/fixtures/legacy-export.sample.ts`.

Solo se migran socios, membresías, saldo pendiente resumido y estado legado —
no pagos históricos detallados ni reservas históricas. **No commitear aquí
ningún dato real de socios**: solo datos ficticios.
