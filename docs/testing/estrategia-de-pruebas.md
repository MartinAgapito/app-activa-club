# Estrategia de pruebas — Activa Club

> Entregable de [US-006](../scrum/historias/US-006-estrategia-matriz-pruebas.md) (Sprint 0, QA).
> Deriva de las [reglas de negocio](../product/reglas-de-negocio.md) (US-001) y de
> los [contratos de API](../api/contratos-api.md) / [modelo de datos](../data/modelo-dynamodb.md)
> (US-003). No introduce funcionalidad de negocio ni pruebas automatizadas
> implementadas: es fundación para el Sprint 1 en adelante.

## 1. Propósito y alcance

Definir cómo se prueba Activa Club para que ninguna historia funcional se
declare terminada sin que sus criterios de aceptación y las reglas de negocio
(`RN-*`) que la sustentan estén verificados. Esta estrategia cubre:

- Niveles de prueba y herramientas por nivel.
- Criterios para decidir qué nivel usar según el riesgo del flujo.
- Política de datos de prueba (nunca reales).
- Responsabilidades por rol.
- Cobertura mínima y puertas de calidad (gates) en CI.
- Gestión de defectos (severidad, evidencia).
- Enfoque de regresión.
- Pendientes explícitos que solo se pueden cerrar cuando exista implementación
  real (Sprint 1+).

No se implementan pruebas automatizadas en este documento (criterio de
aceptación de US-006). Los `vitest.config.ts` / `playwright.config.ts` reales
se crearán en Sprint 1, junto con el scaffolding funcional de `apps/web`
(US-008) y `apps/api` (US-009); aquí solo se documentan como plantilla de
referencia (§9) para no adelantar configuración a paquetes que hoy no tienen
dependencias instaladas ni scripts (`apps/web/package.json` y
`apps/api/package.json` están "pendiente de scaffolding funcional").

## 2. Principios

1. **Las reglas críticas se validan en el backend.** El frontend puede
   replicar validaciones para UX, pero la prueba que certifica una regla de
   negocio (`RN-*`) debe ejercer el backend (Lambda + DynamoDB), nunca
   solo el formulario del cliente.
2. **No solo el camino feliz.** Todo caso de alto riesgo (pagos, permisos,
   reservas, migración) incluye variantes de error, duplicidad, expiración y
   rechazo administrativo.
3. **Pirámide de pruebas.** Base amplia de pruebas unitarias (rápidas,
   baratas), capa intermedia de integración (contratos y reglas contra
   infraestructura emulada) y una capa delgada de E2E (flujos completos de
   usuario, los más caros de mantener).
4. **Trazabilidad obligatoria.** Toda prueba de riesgo alto o bloqueante debe
   poder rastrearse a una historia (`US-*`), una o más reglas (`RN-*`) y, si
   aplica, un endpoint del contrato API. Ver la
   [matriz de trazabilidad](./matriz-trazabilidad.md).
5. **Contratos como única fuente de verdad.** Las pruebas de integración y E2E
   validan contra los tipos de `packages/shared-types` y los esquemas Zod de
   `packages/validation`; no se duplican reglas de forma ad hoc en los tests.
6. **Nunca datos reales.** Ver política de datos (§5).

## 3. Niveles de prueba y herramientas

| Nivel | Herramienta | Objeto de prueba | Ubicación prevista |
|-------|-------------|-------------------|---------------------|
| Unitaria | **Vitest** | Funciones puras, esquemas Zod (`packages/validation`), utilidades de dominio (cálculo de aforo, solapamiento de horarios, cálculo de cancelación 24h, mapeo de migración), reducers/hooks aislados del frontend | `packages/*/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` |
| Integración (componentes) | **Vitest + React Testing Library (RTL)** | Componentes y formularios de `apps/web` con estado, validación cliente-servidor simulada (MSW o mocks de fetch), estados de carga/error/vacío, restricciones de permisos en UI | `apps/web/src/**/*.test.tsx` |
| Integración (API/backend) | **Vitest + pruebas de API** (invocación directa de handlers Lambda o `supertest`/`fetch` contra emulación local: `serverless-offline`/SAM local + DynamoDB Local) | Reglas de negocio server-side: aforo, cruces, deuda, idempotencia de pago, aprobación/rechazo, unicidad de DNI/email, auditoría | `apps/api/test/integration/**` |
| E2E | **Playwright** | Flujos completos de usuario contra un entorno desplegado (`dev`/`demo`) o local: activación → login → reserva; registro → aprobación → pago → reserva; pago exitoso/fallido en Culqi sandbox; cancelación; notificaciones; dashboard admin | `apps/web/e2e/**` (o paquete E2E dedicado, a confirmar en Sprint 1) |
| Manual documentada | Casos exploratorios en `docs/testing/` (plantilla en §8) | Exploración de usabilidad, accesibilidad básica, responsive en dispositivos reales, casos que aún no se automatizan | `docs/testing/casos-manuales/**` |

### 3.1 Qué NO se prueba en cada nivel

- Unitario: no debe tocar red, DynamoDB real ni Culqi real.
- Integración: puede usar DynamoDB Local/emulado y **Culqi sandbox** (nunca
  producción); no depende de la UI.
- E2E: no reimplementa reglas de negocio con aserciones de detalle interno;
  valida el resultado observable por el usuario (estado, mensaje, navegación).

## 4. Criterio de selección de nivel según riesgo

| Riesgo del flujo | Ejemplo | Nivel(es) obligatorio(s) |
|-------------------|---------|---------------------------|
| **Crítico** (dinero, identidad, permisos, integridad de reservas) | Pagos (RN-PAG-04/06/07/08), unicidad de DNI (RN-ACT-03), aforo/cruces/superposición (RN-RES-07/08/09), control de acceso por rol | Unitaria **+** Integración de API **+** al menos un E2E por flujo feliz y su variante de error principal |
| **Alto** (afecta disponibilidad o confianza del socio) | Aprobación/rechazo de socio y de reservas de parrilla/salón, cancelación 24h, mantenimiento de recurso | Unitaria + Integración de API; E2E si el flujo es visible end-to-end para el usuario |
| **Medio** (funcionalidad secundaria, no bloquea dinero/reservas) | Notificaciones, inbox, dashboards de solo lectura, actualización de perfil | Unitaria + Integración; E2E opcional (smoke test) |
| **Bajo** (presentación, contenido estático) | Textos, layout no funcional, tokens de diseño | RTL puntual o revisión manual |

Regla general: **a mayor severidad de la regla si falla (bloqueante/alta), más
niveles de prueba son obligatorios y no opcionales.** La matriz de
trazabilidad (§ siguiente documento) asigna el nivel mínimo por caso.

## 5. Política de datos de prueba

1. **Nunca datos reales ni credenciales reales** (socios, DNIs, correos,
   tarjetas, tokens de Cognito/Culqi de producción). Regla obligatoria, sin
   excepción.
2. **DNI de prueba**: 8 dígitos sintéticos con formato válido
   (`dniSchema`), por ejemplo `00000001`..`00000099`, documentados como
   rango reservado para pruebas y nunca usados como DNI real migrado.
3. **Correos de prueba**: dominio `@example.com` o `@test.activaclub.local`.
   Nunca dominios reales de socios.
4. **Contraseñas de prueba**: generadas por el runner de pruebas, nunca
   hardcodeadas como contraseñas reales reutilizables ni commiteadas fuera de
   fixtures de test.
5. **Migración (RN-MIG-01)**: los datos de origen para pruebas de migración
   son un JSON mock ficticio (ver `mock-data/README.md`), nunca un export real
   del sistema on-premise. El propio dataset de migración de producción/demo,
   si existe, no se usa en pruebas automatizadas.
6. **Pagos**: exclusivamente **Culqi sandbox** con tokens de prueba
   (`tkn_test_...`) y tarjetas de prueba publicadas por Culqi para sandbox.
   Nunca se usan tarjetas reales ni llaves de producción en pruebas
   (RN-PAG-04/08). Las llaves de sandbox se inyectan por variables de entorno
   (`.env` no commiteado; ver `.env.example`), nunca hardcodeadas en el
   código de prueba.
7. **Aislamiento de entorno**: las pruebas de integración/E2E corren contra
   `dev`/`demo` o emulación local, nunca contra un entorno con datos de
   socios reales. Los IDs generados en pruebas se limpian o se aíslan por
   prefijo/TTL para no contaminar analíticas (RN-ANL-*).
8. **Secretos**: ninguna prueba ni fixture contiene secretos de AWS,
   Cognito o Culqi; las credenciales de test se resuelven vía variables de
   entorno/CI (consistente con US-005: OIDC, sin llaves estáticas).

## 6. Responsabilidades por rol

| Rol | Responsabilidad de calidad |
|-----|------------------------------|
| **Frontend** | Pruebas unitarias de utilidades propias; pruebas de integración con RTL de formularios, estados de carga/error/vacío y restricciones de UI por rol; participa en E2E de flujos de pantalla. |
| **Backend** | Pruebas unitarias de lógica de dominio (aforo, solapamiento, idempotencia, expiración de membresía); pruebas de integración de cada handler Lambda contra DynamoDB Local, incluyendo variantes de error de cada código (`error.code`) del contrato. |
| **QA** | Define y mantiene esta estrategia y la matriz de trazabilidad; diseña casos de prueba desde criterios de aceptación; ejecuta/orquesta E2E; valida permisos, seguridad básica y no filtración de datos sensibles; ejecuta regresión; reporta defectos con severidad y evidencia; es quien aprueba, aprueba con observaciones o rechaza el cierre de una historia. |
| **DevOps** | Mantiene el pipeline de CI (US-005) ejecutando lint, typecheck y pruebas en cada Pull Request; provee la infraestructura de emulación/entorno `dev`/`demo` para integración y E2E. |
| **Arquitecto/Integrador** | Garantiza que contratos y modelo de datos (fuente de verdad de las pruebas de contrato) se mantengan consistentes con la implementación (relacionado con US-010). |

Ninguna historia funcional se considera terminada solo porque el frontend "se
ve bien"; requiere la validación de backend descrita en este documento
(Definition of Done, criterio 4).

## 7. Cobertura mínima y puertas de calidad

- **CI (US-005)**: cada Pull Request ejecuta lint, formato, typecheck y
  pruebas; el pipeline debe fallar si un paso falla. Mientras no existan
  pruebas en un workspace, el paso de pruebas pasa en verde sin falsos
  positivos (`--if-present`), tal como define US-005.
- **Cobertura mínima orientativa para Sprint 1 en adelante** (a confirmar
  como umbral duro cuando exista implementación real):
  - Esquemas de validación (`packages/validation`): 100 % de los esquemas
    con al menos un caso válido y uno inválido por campo obligatorio.
  - Lógica de negocio crítica en `apps/api` (aforo, cruces, superposición,
    idempotencia, cancelación 24h, unicidad DNI/email): 100 % de las ramas
    de error de negocio (cada `error.code` de la [tabla 1.3 de contratos-api.md](../api/contratos-api.md#13-códigos-de-error-de-dominio-errorcode)) debe tener al menos un test de integración.
  - Componentes de UI con lógica condicional por rol/estado: cobertura por
    caso (activo, con deuda, vencido, pendiente) más que por porcentaje de
    líneas.
  - E2E: al menos un flujo feliz y un flujo de error por módulo crítico
    (activación, pago, reserva).
- **No se aprueba una historia** cuyo criterio de aceptación dependa de una
  regla `RN-*` de severidad bloqueante o alta sin evidencia de prueba que la
  cubra (ver matriz).

## 8. Gestión de defectos

### 8.1 Severidades

| Severidad | Definición | Ejemplo |
|-----------|------------|---------|
| **Bloqueante** | Impide el uso del flujo principal, compromete dinero/seguridad/integridad de datos, o viola una regla `RN-*` crítica sin workaround. | Doble cobro por reintento; reserva que supera aforo; socio con deuda logra reservar; datos de tarjeta persistidos. |
| **Alta** | Afecta un flujo importante con workaround limitado o impacto en varios usuarios. | Cancelación después de 24h no bloqueada; aprobación de socio no dispara notificación; 403 no aplicado en endpoint admin. |
| **Media** | Afecta un caso de borde o secundario, no bloquea el flujo principal. | Mensaje de error genérico en vez del código de dominio esperado; segmentación de notificación con conteo incorrecto. |
| **Baja** | Cosmético, de contenido o UX menor. | Texto truncado, espaciado inconsistente en mobile. |

### 8.2 Plantilla mínima de reporte

```
Título: <resumen corto>
Historia/Módulo: US-xxx / RN-xxx
Severidad: bloqueante | alta | media | baja
Entorno: local | dev | demo
Pasos para reproducir:
1. ...
2. ...
Resultado esperado:
Resultado obtenido:
Evidencia: captura, log, request/response (sin datos sensibles reales)
```

### 8.3 Regla de cierre

Los defectos **bloqueantes y altos** deben resolverse o ser aceptados
explícitamente (con justificación documentada) antes de cerrar una historia;
los de severidad **media/baja** pueden diferirse con seguimiento explícito.

## 9. Plantillas de configuración para Sprint 1 (referencia, no activas)

Estas plantillas **no se instalan en este Sprint 0** (US-006 no incluye
implementación de pruebas automatizadas). Se documentan aquí para que
Frontend (US-008) y Backend (US-009), al hacer el scaffolding funcional de
`apps/web` y `apps/api`, las adopten sin diseñar la configuración desde cero.

### 9.1 `apps/web/vitest.config.ts` (borrador de referencia)

```ts
// Borrador de referencia — activar en Sprint 1 junto con el scaffolding de
// Vite/React (US-008). No instalar hasta tener las dependencias correspondientes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
```

### 9.2 `apps/api/vitest.config.ts` (borrador de referencia)

```ts
// Borrador de referencia — activar en Sprint 1 junto con el scaffolding de
// Lambdas (US-009). No instalar hasta tener las dependencias correspondientes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
```

### 9.3 `apps/web/e2e/playwright.config.ts` (borrador de referencia)

```ts
// Borrador de referencia — activar en Sprint 1 cuando exista un entorno
// dev/demo desplegado o un servidor local de apps/web.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

## 10. Pendientes explícitos (no verificables en Sprint 0)

Estos puntos **no pueden ejecutarse ni validarse** hasta que exista
implementación real (Sprint 1+), porque hoy no existen Lambdas desplegadas,
tablas DynamoDB reales, ni frontend funcional:

1. Ejecución real de pruebas de integración contra DynamoDB Local/AWS: no hay
   handlers implementados (depende de US-009 en Sprint 1).
2. Ejecución real de E2E contra `apps/web`: no hay scaffolding de Vite/React
   aún (depende de US-008 en Sprint 1).
3. Pruebas contra Culqi sandbox real (tokens, webhook con firma): dependen de
   la integración de pagos (ADR-0007) implementada en Sprint 1+.
4. Medición de cobertura real (%): no hay código de producción que cubrir.
5. Pruebas de carga/performance: fuera de alcance del MVP y de Sprint 0; se
   evaluará su necesidad cuando exista tráfico real o de staging.
6. Pruebas de accesibilidad automatizada (axe-core vía Playwright): se
   incorporan cuando exista UI real; en Sprint 0 solo se documentan como
   parte de la estrategia (§3, §4).
7. Ajuste del umbral duro de cobertura mínima (§7): se revisará con datos
   reales de Sprint 1, hoy es orientativo.

## 11. Referencias

- [Reglas de negocio](../product/reglas-de-negocio.md)
- [Contratos de API](../api/contratos-api.md)
- [Modelo de datos DynamoDB](../data/modelo-dynamodb.md)
- [Matriz de trazabilidad de pruebas](./matriz-trazabilidad.md)
- [Definition of Done](../scrum/definition-of-done.md)
- [US-005 — CI de calidad](../scrum/historias/US-005-ci-calidad-github-actions.md)
- [US-010 — Validar contratos e integración](../scrum/historias/US-010-validar-contratos-integracion.md)
- [ADR-0007 — Culqi sandbox e idempotencia de pagos](../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md)
- [ADR-0008 — Observabilidad, logging y auditoría](../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)

## Historial de cambios

- 2026-07-09: Versión inicial de la estrategia de pruebas (US-006, Sprint 0).
