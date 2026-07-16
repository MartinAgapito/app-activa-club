# ADR-0005 — S3 para migración, activos y hosting del SPA

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002

## Contexto

Se necesita: (a) almacenar el JSON de migración on-premise (RN-MIG-01), (b)
guardar activos del sistema, y (c) servir el frontend React/Vite (build
estático). Todo con bajo costo y sin servidores.

## Decisión

Se usa **Amazon S3** para tres propósitos, con buckets separados:

1. **Bucket de migración** (`activa-club-<env>-migration`): almacena el JSON mock
   on-premise. Privado, versionado, cifrado (SSE-S3). Solo la Lambda de migración
   tiene permiso de lectura.
2. **Bucket de activos** (`activa-club-<env>-assets`): activos del sistema
   (p. ej. imágenes/plantillas). Privado; acceso vía URLs prefirmadas o
   CloudFront según necesidad.
3. **Hosting del SPA** (`activa-club-<env>-web`): build estático de `apps/web`,
   distribuido por **CloudFront** con HTTPS y OAC (Origin Access Control); el
   bucket permanece privado.

Buckets privados, cifrado en reposo y acceso por IAM de mínimo privilegio.

## Alternativas consideradas

- **Cargar el JSON directamente en Lambda/repo**: acopla datos a código y no
  refleja el origen "archivo externo del on-premise". Rechazada; S3 modela mejor
  el artefacto de migración y su versionado.
- **Hosting del SPA en Amplify Hosting**: válido, pero S3+CloudFront es más
  transparente en Terraform y suficiente. Se prefiere por control e IaC.
- **Un único bucket para todo**: mezcla superficies de seguridad (datos de
  migración junto al sitio público). Rechazada por separación de responsabilidades.

## Consecuencias

- **Positivas**: costo casi nulo, cifrado y versionado, separación clara de
  responsabilidades y permisos.
- **Negativas**: más buckets que declarar; se gestiona con un módulo Terraform.
- **Impacto**:
  - _Terraform (US-004)_: buckets + políticas + CloudFront + OAC.
  - _Backend (US-009)_: Lambda de migración lee del bucket de migración.
  - _Frontend (US-008)_: pipeline publica el build al bucket `web`.
  - _CI/CD (US-005)_: invalidación de CloudFront tras desplegar el SPA.
