# US-001 — Documentar visión, alcance y reglas de negocio

| Campo | Valor |
|-------|-------|
| ID | US-001 |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo | Historia de producto / documentación |
| Responsable | Scrum / Product Analyst |
| Fase | MVP — Fundación |
| Sprint | Sprint 0 |
| Prioridad | Crítica |
| Estimación relativa | 5 |
| Dependencias | Ninguna |

## Historia

Como equipo de Activa Club, quiero contar con la visión, el alcance y las reglas de negocio documentados y accesibles, para que frontend, backend, DevOps, QA y arquitectura compartan un entendimiento único del producto antes de desarrollar.

## Valor de negocio

Un entendimiento común y explícito del alcance evita retrabajo, decisiones contradictorias y funcionalidad fuera del MVP. Es la base de trazabilidad de todas las historias funcionales.

## Criterios de aceptación

1. Existe un documento de visión y objetivos en `docs/product/` con visión, objetivos de negocio, roles y métricas de éxito del MVP.
2. Existe una matriz de alcance en `docs/product/` que clasifica cada capacidad en MVP, fase posterior o fuera de alcance, derivada del Contexto Maestro.
3. La matriz refleja explícitamente que IA, QR, lista de espera, WhatsApp y predicciones son fase posterior, no MVP.
4. Existen las reglas de negocio en `docs/product/`, organizadas por módulo (migración, activación/registro, membresías/pagos, reservas, notificaciones, administración, analytics) e identificadas con prefijos `RN-*` verificables.
5. La épica EP-01 y el Sprint 0 están formalizados en `docs/scrum/` con historias, criterios, prioridad, dependencias y trazabilidad.
6. Existen la Definition of Ready y la Definition of Done generales del proyecto en `docs/scrum/`.
7. Toda la documentación es coherente con el Contexto Maestro y no lo contradice ni lo modifica.
8. Ninguna historia introduce funcionalidad de negocio durante el Sprint 0.

## Casos alternativos / excepciones

- Si se detecta ambigüedad o conflicto con el Contexto Maestro, se escala al product owner y al guardián de contexto; no se resuelve modificando el Contexto Maestro desde esta historia.

## Notas

- El Contexto Maestro es fuente única de verdad; esta historia lo traduce en artefactos accionables, no lo reemplaza.

## Trazabilidad

- Épica: EP-01
- Habilita: US-002, US-003, US-006, US-008 (todas dependen de la definición funcional).
- Documentos producidos: `docs/product/vision-y-objetivos.md`, `docs/product/matriz-de-alcance.md`, `docs/product/reglas-de-negocio.md`, `docs/scrum/**`.
