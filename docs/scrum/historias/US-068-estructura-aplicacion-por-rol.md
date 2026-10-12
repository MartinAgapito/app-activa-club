# US-068 — Navegar con barra lateral y cabecera según mi rol

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-068                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque A — base de diseño)          |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-061, US-063                                           |

## Contexto

`MemberLayout` y `AdminLayout` muestran una cabecera con el nombre del club, una etiqueta de rol y "Cerrar sesión", y una lista de enlaces que en móvil se desplaza horizontalmente (`overflow-x-auto`). No hay iconos, ni agrupación, ni el nombre del usuario, ni forma de ocultar la navegación en pantallas chicas.

## Historia

Como **socio o administrador**, quiero **una navegación lateral clara, con mi nombre y mi rol siempre visibles y que en el celular se abra como menú**, para **saber dónde estoy y llegar a cualquier sección sin buscarla**.

## Contrato de API

`GET /members/me` (socio) para el nombre, ya consumido por otras pantallas. Para el administrador, el nombre o correo disponible en la sesión de Cognito. Sin cambios en el servidor.

## Valor de negocio

Es el marco de todas las pantallas autenticadas: lo primero que el jurado y el socio perciben como "aplicación" y no como "página".

## Precondiciones

- El usuario tiene sesión iniciada con rol `member` (con `memberStatus=ACTIVE`) o `admin`.

## Postcondiciones

- Ninguna; es de navegación.

## Criterios de aceptación

1. En pantallas de 1024 px o más hay una barra lateral fija con el logotipo del club y los enlaces de su rol, cada uno con icono y texto; el enlace de la sección actual se distingue visualmente y con `aria-current="page"`.
2. Los enlaces se agrupan por tema: socio — Inicio; Reservas (Reservar, Mis reservas); Mi cuenta (Membresía, Pagos, Notificaciones, Perfil). Administrador — Inicio; Socios (Socios, Solicitudes, Membresías); Operación (Reservas, Instalaciones y mantenimiento); Comunicación y análisis (Notificaciones, Analítica).
3. La cabecera muestra el nombre del usuario (nombre de pila para el socio), su rol en texto y un menú con "Mi perfil" (solo socio) y "Cerrar sesión".
4. En pantallas de menos de 1024 px la barra lateral se oculta y un botón de menú con nombre accesible ("Abrir menú") la abre como panel lateral izquierdo (US-063); el panel se cierra al elegir un enlace o con Escape.
5. Existe un enlace "Saltar al contenido" que es el primer elemento enfocable de la página y lleva el foco al contenido principal.
6. El contenido principal está en un `<main>` y la barra lateral en un `<nav>` con nombre accesible distinto para cada rol.
7. Ninguna pantalla autenticada produce desplazamiento horizontal de la página a 375 px de ancho.
8. Las rutas, los guardas de rol (`RequireRole`, `RequireActiveMember`) y las direcciones existentes no cambian.
9. Un enlace a una sección todavía en construcción sigue visible (no se ocultan secciones del MVP), para que el mapa de la aplicación sea completo.

## Casos alternativos / excepciones

- **Fallo al obtener el nombre del socio**: la cabecera muestra "Socio" y la navegación funciona igual.
- **Socio no activo** (`/cuenta/pendiente-aprobacion`, checkout de la primera membresía): fuera de esta estructura, como hoy.

## Sugerencia de pruebas funcionales

- Prueba de componente: el enlace activo tiene `aria-current="page"`; a menos de 1024 px el menú abre y cierra el panel.
- Revisión manual en 375, 768 y 1280 px.
- T-06: un `member` no ve los enlaces de administración.

## Trazabilidad

- Épica: EP-08 (bloque A).
- Casos de prueba: UX-05, UX-06, T-01, T-02, T-06.
- Depende de: US-061, US-063.
- Habilita: US-070, US-071.
