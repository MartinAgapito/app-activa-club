# mock-data

Archivo(s) JSON que representan el sistema on-premise de Activa Club, usados
como fuente para la migración inicial hacia Amazon DynamoDB (ver
`docs/product/contexto-maestro.md`, sección "Migración on-premise").

Esta carpeta no versiona el JSON: el archivo que se ejecuta vive en el bucket S3 de
migración (ADR-0005) y la fuente de prueba versionada es el fixture ficticio
`apps/api/src/migration/fixtures/legacy-export.sample.ts`. Solo se migran socios, membresías, saldo pendiente
resumido y estado legado — no pagos históricos detallados ni reservas
históricas. No commitear aquí ningún dato real de socios (usar datos ficticios
para el mock).
