# US-062 — Componente de ventana modal accesible

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-062                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Crítica                                                  |
| Estimación relativa | 3                                                        |
| Dependencias        | US-061 (y pregunta abierta 2 de EP-08)                   |

## Contexto

El único diálogo existente, `ConfirmDialog` (`packages/ui`), sirve para confirmar, pero no para alojar un formulario o un flujo; además no atrapa el foco, no lo devuelve al cerrar y usa identificadores fijos que se repiten si hay dos diálogos en la misma página. Los flujos del bloque C (asistente de reserva, editar instalación, crear bloqueo, rechazar con motivo) necesitan una ventana modal general.

## Objetivo

Que socio y administrador puedan completar una tarea en una ventana superpuesta, usable solo con teclado y con lector de pantalla, sin perder el contexto de la pantalla de fondo.

## Entregable

Componente `Modal` exportado por `@activa-club/ui`, con pruebas, y `ConfirmDialog` reconstruido sobre él sin cambiar su interfaz pública.

## Valor de negocio

Es el reclamo central del dueño del producto ("por qué no abren modales"). Todas las acciones de creación, edición y decisión del bloque C dependen de este componente.

## Criterios de aceptación

1. La ventana tiene título obligatorio, contenido y una zona de acciones opcional al pie; admite tres anchos (pequeño, mediano, grande).
2. Al abrirse, el foco pasa al primer control enfocable del contenido o, si no hay ninguno, al título.
3. Mientras está abierta, Tab y Shift+Tab recorren solo los controles de la ventana (foco atrapado).
4. Escape la cierra, salvo que el llamador la marque como "no cerrable" mientras una operación está en curso.
5. Un clic fuera del panel la cierra solo si el llamador lo permite (por defecto no, para no perder un formulario a medio llenar).
6. Al cerrarse, el foco vuelve al control que la abrió.
7. Expone `role="dialog"` y `aria-modal="true"`; su título y su descripción se asocian con `aria-labelledby`/`aria-describedby` usando identificadores únicos generados, de modo que dos ventanas en la misma página no comparten identificadores.
8. El contenido de fondo no se desplaza mientras la ventana está abierta, y el contenido de la ventana se desplaza dentro de ella si no cabe en la pantalla.
9. En pantallas de menos de 640 px ocupa todo el ancho y alto disponibles, con la zona de acciones siempre visible.
10. Admite un botón de cierre con nombre accesible ("Cerrar").
11. `ConfirmDialog` usa este componente por dentro, conserva su interfaz y sus pruebas existentes siguen pasando; mantiene `role="alertdialog"`.
12. El componente no conoce reglas de negocio ni llama a la API.

## Casos alternativos / excepciones

- **Ventana dentro de ventana**: no se admite en el MVP; un flujo que necesite confirmar dentro de una ventana reemplaza su contenido por la confirmación.
- **Navegación del navegador ("atrás") con la ventana abierta**: la cierra (ver pregunta abierta 6 de EP-08).

## Sugerencia de pruebas funcionales

- Prueba de componente: abrir, Tab hasta el último control y comprobar que el siguiente Tab vuelve al primero; Escape cierra; el foco vuelve al botón que la abrió.
- Dos ventanas montadas en la misma página → identificadores distintos.
- Revisión manual con lector de pantalla (NVDA o VoiceOver): anuncia el título al abrir.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-01, T-02.
- Depende de: US-061.
- Habilita: US-063, US-072, US-074..US-078.
