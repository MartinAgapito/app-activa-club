# Definition of Ready (DoR) — Activa Club

> Una historia solo puede entrar a un Sprint Backlog cuando cumple todos los criterios de esta lista. Aplica a todo el equipo (Frontend, Backend, DevOps, QA, Arquitectura, Git Steward, Integrador).

Una historia está **lista para desarrollo** cuando:

1. Tiene título, descripción y valor de negocio claros.
2. Usa el formato "Como [rol], quiero [objetivo], para [beneficio]" (o, si es tarea técnica, tiene objetivo y entregable explícitos).
3. Tiene criterios de aceptación verificables y sin ambigüedad.
4. Se conocen los roles y permisos involucrados (`member` / `admin`).
5. Se conocen las dependencias con otras historias o artefactos.
6. Está asignada a una épica y a una fase del proyecto (MVP / fase posterior).
7. Está clasificada en la matriz de alcance.
8. Referencia las reglas de negocio relevantes (`RN-*`) cuando aplica.
9. Tiene prioridad y estimación relativa asignadas.
10. No contiene ambigüedades funcionales críticas pendientes de resolver.
11. No introduce funcionalidad fuera del MVP sin aprobación explícita del product owner.
12. Cuando cruza frontend y backend, el contrato de API está identificado (documentado o planificado por el Arquitecto).

## Criterios adicionales para tareas técnicas

- El entregable es concreto y verificable (archivo, configuración, documento, pipeline, módulo).
- No introduce decisiones que contradigan el Contexto Maestro ni las normas de ingeniería.
- Respeta el principio de que la infraestructura AWS vive en Terraform y CI/CD usa OIDC.
