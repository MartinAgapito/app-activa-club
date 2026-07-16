# US-008 — Diseñar mapa de rutas y design foundation

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-008                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | Frontend                                                              |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Media                                                                 |
| Estimación relativa | 5                                                                     |
| Dependencias        | US-001, US-003                                                        |

## Objetivo

Diseñar el mapa de rutas del frontend (público, socio, administrador) y la base de diseño (design foundation: tokens, layout, componentes fundamentales, guías responsive) para habilitar el desarrollo de pantallas del MVP en el Sprint 1.

## Entregable

Mapa de rutas y design foundation documentados (en `docs/product/` o `docs/architecture/` según acuerde el equipo) y estructura base prevista en `apps/web` y, si aplica, `packages/ui`, sin implementar funcionalidad de negocio.

## Valor de negocio

Un mapa de rutas y una base de diseño acordados evitan divergencia visual y de navegación entre pantallas y aceleran el desarrollo paralelo del frontend.

## Criterios de aceptación

1. Existe un mapa de rutas que cubre las áreas del MVP: autenticación (login, recuperación, activación, registro), Home/dashboard del socio, membresías y pagos, reservas por recurso, notificaciones, perfil, y área de administración.
2. Cada ruta indica el rol requerido (`público`, `member`, `admin`).
3. Existe una design foundation con tokens (colores, tipografía, espaciado), enfoque responsive y componentes fundamentales.
4. El mapa de rutas es coherente con las reglas de negocio (US-001) y los contratos/modelo de datos (US-003).
5. Refleja restricciones funcionales clave (por ejemplo, un socio con deuda accede a pagar pero no a reservar).
6. Usa el stack acordado (React, Vite, Tailwind) como marco, sin implementar aún las pantallas.
7. No incluye lógica de negocio ni llamadas reales a la API.

## Casos alternativos / excepciones

- Rutas dependientes de aprobación (socio pendiente) deben contemplar el estado de espera y su vista correspondiente.

## Trazabilidad

- Épica: EP-01
- Depende de: US-001, US-003
- Habilita: desarrollo de pantallas del MVP en Sprint 1; entrada para US-010 (validación de integración).
