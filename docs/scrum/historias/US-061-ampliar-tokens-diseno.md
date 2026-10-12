# US-061 — Ampliar los tokens de diseño (superficies, tipografía, capas y estados)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-061                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Crítica                                                  |
| Estimación relativa | 2                                                        |
| Dependencias        | — (requiere resuelta la pregunta abierta 1 de EP-08)     |

## Contexto

US-008 dejó tokens de color (`brand`, `positive`, `warning`, `danger`) y la fuente preferida en `apps/web/src/styles/theme.css`, documentados en `apps/web/docs/design-foundation.md`. Faltan los tokens que necesitan los componentes nuevos: superficies y textos con nombre semántico, una escala tipográfica propia, elevaciones, radios, capas superpuestas (ventana, panel lateral, avisos) y estados de interacción. Hoy cada pantalla elige grises `slate-*` y sombras a mano, y por eso la interfaz se ve plana y desigual.

## Objetivo

Ampliar —sin reemplazar— la base de diseño con tokens semánticos que todos los componentes del bloque A y las pantallas usen de forma consistente.

## Entregable

Tokens nuevos en `apps/web/src/styles/theme.css` y su documentación en `apps/web/docs/design-foundation.md` (nueva versión), con ejemplos visibles en `/_dev/design-system`.

## Valor de negocio

Es la diferencia más visible entre "básico" y "terminado": jerarquía, contraste y profundidad consistentes en todas las pantallas, con un solo lugar donde cambiarlos.

## Criterios de aceptación

1. Existen tokens semánticos de **superficie** (fondo de aplicación, superficie de tarjeta, superficie elevada), **texto** (principal, secundario, deshabilitado, sobre color de marca) y **borde** (normal, fuerte, de foco), definidos a partir de las escalas existentes.
2. Existe una **escala tipográfica** nombrada (títulos de página, de sección y de tarjeta; cuerpo; texto auxiliar; cifras destacadas) con tamaño, peso e interlineado.
3. Existen tokens de **radio** (control, tarjeta, ventana) y de **elevación** (tarjeta, ventana, panel lateral, aviso efímero).
4. Existen tokens de **capa** (`z-index`) con un orden único documentado: contenido < cabecera fija < panel lateral < ventana < aviso efímero.
5. Existen tokens de **estado de interacción** (hover, presionado, deshabilitado, foco visible) aplicables a cualquier control.
6. Existen tokens de **movimiento** (duración corta y media) y toda transición se anula cuando el sistema pide reducir movimiento (`prefers-reduced-motion`).
7. Los pares texto/fondo de los tokens cumplen contraste mínimo WCAG 2.1 AA (4.5:1 texto normal, 3:1 texto grande y bordes de foco); la tabla de contrastes queda en la documentación.
8. La fuente preferida se sirve desde el propio sitio (sin CDN externo), con fuentes del sistema como respaldo.
9. Los componentes existentes de `packages/ui` (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `PageLayout`) pasan a usar los tokens nuevos sin cambiar su interfaz pública; sus pruebas existentes siguen pasando.
10. La documentación de la base de diseño queda actualizada con un historial de cambios que referencia esta historia.

## Casos alternativos / excepciones

- **Pregunta abierta 1 de EP-08 sin resolver**: se aplica la propuesta por defecto (conservar la paleta de US-008).
- **Modo oscuro**: fuera de alcance; los tokens semánticos solo lo dejan preparado.

## Sugerencia de pruebas funcionales

- Revisión visual en `/_dev/design-system` de cada token.
- Verificación de contraste de la tabla del criterio 7 con una herramienta de contraste.
- Con "reducir movimiento" activado en el sistema operativo, ninguna transición se anima.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: T-02, UX-14.
- Depende de: — (amplía US-008).
- Habilita: US-062..US-068.
