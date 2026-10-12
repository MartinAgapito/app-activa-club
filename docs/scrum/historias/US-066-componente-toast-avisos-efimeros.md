# US-066 — Componente de avisos efímeros (toast)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-066                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Tarea técnica (bloque A — base de diseño)                |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 2                                                        |
| Dependencias        | US-061                                                   |

## Contexto

Hoy el resultado de una acción (reserva creada, bloqueo liberado, solicitud aprobada) se muestra como una tarjeta o un mensaje dentro de la sección, que a veces queda fuera de la vista. Al cerrar una ventana tras confirmar, el usuario necesita una confirmación breve que no dependa de dónde está en la página.

No confundir con las **notificaciones** de EP-05 (bandeja persistente y correo): un aviso efímero es solo la confirmación visual inmediata de una acción del propio usuario y no se guarda.

## Objetivo

Confirmar el resultado de una acción con un mensaje breve, visible y accesible, sin interrumpir el trabajo.

## Entregable

Proveedor y función de uso (`ToastProvider`, `useToast`) exportados por `@activa-club/ui`, con pruebas, y el proveedor montado en la raíz de `apps/web`.

## Valor de negocio

Cierra cada flujo del bloque C con una confirmación clara y consistente ("Reserva confirmada", "Bloqueo liberado").

## Criterios de aceptación

1. Admite tres tipos: éxito, información y error, con icono y texto (nunca solo color).
2. Los avisos de éxito e información se anuncian con `role="status"` y desaparecen solos a los 5 segundos; los de error se anuncian con `role="alert"` y permanecen hasta que el usuario los cierra.
3. El tiempo se detiene mientras el puntero está encima o el aviso tiene el foco.
4. Cada aviso tiene un botón de cierre con nombre accesible y, opcionalmente, una acción (por ejemplo "Ver en Mis reservas").
5. Se muestran como máximo tres avisos a la vez; el más antiguo se descarta al llegar el cuarto.
6. Aparecen en una esquina fija (abajo a la derecha en escritorio, abajo a todo el ancho en móvil), por encima de ventanas y paneles (token de capa de US-061), sin tapar la zona de acciones de una ventana abierta en móvil.
7. Un aviso no roba el foco del control en uso.
8. El componente no conoce reglas de negocio ni llama a la API.

## Sugerencia de pruebas funcionales

- Prueba de componente con temporizadores simulados: éxito desaparece a los 5 s; error permanece; cuarto aviso descarta el primero.
- Revisión manual con lector de pantalla: el aviso se anuncia sin mover el foco.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-04.
- Depende de: US-061.
- Habilita: US-072, US-074..US-078.
