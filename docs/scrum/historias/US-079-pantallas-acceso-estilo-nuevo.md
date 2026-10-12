# US-079 — Entrar al club con pantallas de acceso del nuevo estilo visual

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-079                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque B — primera impresión)       |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-061                                                   |

## Contexto

El dueño del producto aprobó la "Dirección visual Activa Club" (azul de marca sobrio, neutros con inclinación al azul, Barlow Semi Condensed para títulos y Hanken Grotesk para texto, tarjetas solo donde hacen falta, mucho aire) y pidió expresamente que **login y registro mantengan el mismo estilo** que el resto de la interfaz. US-061 entregó los tokens y los componentes de `packages/ui` ya los usan, pero las pantallas de acceso todavía componen su propia presentación con clases a mano (`slate-*`, `brand-*`, `rounded-lg`), por lo que **hoy no se nota ningún cambio visible**. Es la parte más visible de la nueva interfaz: lo primero que ve un socio y lo primero que ve el jurado.

Esta historia responde la pregunta 8 de EP-08 (página pública y pantallas de acceso): **sí entran en el rediseño**.

## Historia

Como **visitante o socio**, quiero **que las pantallas de acceso (inicio público, iniciar sesión, activar cuenta, registrarme, recuperar contraseña y espera de aprobación) tengan el mismo estilo claro y moderno que el resto de la plataforma**, para **entrar, registrarme o recuperar mi acceso con confianza y sin dudas sobre qué hacer**.

## Contrato de API

**Sin cambios.** Se conservan los contratos ya consumidos por cada pantalla (Cognito para login y recuperación; `POST /activation/verify`, `POST /activation/complete`, `POST /registration`; `GET /members/me` para la espera de aprobación). No cambian rutas, esquemas de formulario ni textos funcionales.

## Reglas de negocio

Ninguna nueva. Se conservan RN-ACT-01..07 tal como las aplican hoy las pantallas; el servidor sigue siendo la fuente de verdad.

## Valor de negocio

La primera impresión de la plataforma deja de parecer un prototipo, con costo bajo: reutiliza los componentes ya construidos y no toca la lógica de los formularios.

## Precondiciones

- US-061 disponible (tokens semánticos, tipografías autoalojadas y componentes migrados).

## Postcondiciones

- Ninguna; es un cambio de presentación.

## Criterios de aceptación

1. Las pantallas de acceso (`/`, `/login`, `/activar-cuenta`, `/registro`, `/recuperar-password` y `/cuenta/pendiente-aprobacion`) usan **solo tokens y componentes de `packages/ui`**: no quedan clases `slate-*`, colores literales ni `rounded-lg` a mano en ellas.
2. En escritorio (desde 768 px) las pantallas de formulario se componen en **dos zonas**: un panel de marca con el nombre "Activa Club", una frase breve de valor y los beneficios, y la tarjeta del formulario. Por debajo se **apilan** (panel compacto arriba, formulario debajo) y en 375 px no hay desplazamiento horizontal.
3. La tarjeta del formulario mide **como máximo 420 px** de ancho y cada vista tiene **un solo `h1`** y **un solo botón primario**; la cabecera pública usa "Iniciar sesión" como enlace y "Crear cuenta" como botón secundario.
4. Los **enlaces secundarios** están visibles y con texto propio: en login "¿Olvidaste tu contraseña?", "Regístrate" y "Activa tu cuenta con tu DNI"; en las demás pantallas, el camino de vuelta a iniciar sesión.
5. Los formularios muestran **etiqueta visible** en cada campo, error explicado junto al campo y, en los requisitos de contraseña, la lista visible **antes** de escribirla. El orden de tabulación sigue el orden visual y el foco es visible.
6. **Estados**: el envío en curso muestra el botón con `isLoading` (ocupado y deshabilitado); los errores del servidor se anuncian con `role="alert"`; éxito, información y alerta con `role="status"`; **ningún estado se comunica solo con color** (siempre icono y texto).
7. El contraste de texto cumple AA (4.5:1) y el de componentes y foco 3:1, usando los pares ya verificados en `design-foundation.md` §3.5.
8. **No se cargan imágenes ni recursos externos**: el motivo decorativo del panel es CSS puro y las fuentes son las autoalojadas de US-061.
9. **Sin regresiones funcionales**: los textos de las pantallas, las rutas, los esquemas Zod y los mensajes de error por código no cambian, y las pruebas existentes de estas pantallas se conservan.

## Casos alternativos / excepciones

- **`/verificar-correo`**: sigue siendo la pantalla "en construcción" compartida (`UnderConstructionPage`); se rediseña cuando exista su historia funcional.
- **Estado de carga o error en la espera de aprobación**: se conservan `Spinner` y `ErrorState` de `packages/ui`.
- **Sesión ya iniciada en `/login`**: redirige igual que hoy; no se muestra la pantalla.
- **Movimiento reducido**: no se agregan animaciones; las transiciones existentes ya respetan `prefers-reduced-motion`.

## Sugerencia de pruebas funcionales

- Recorrer `/`, `/login`, `/registro`, `/activar-cuenta`, `/recuperar-password` en 375 px y 1280 px: sin desplazamiento horizontal, formulario visible sin desplazarse en 375 px.
- Solo con teclado: completar el login y comprobar el orden correo, contraseña, "¿Olvidaste tu contraseña?", botón.
- Forzar un error de credenciales y comprobar que el mensaje se anuncia y lleva icono y texto.
- Revisar la página con lector de pantalla: un `h1`, panel de marca como región con nombre, campos con etiqueta.

## Trazabilidad

- Épica: EP-08 (bloque B; pregunta abierta 8 resuelta por el dueño del producto).
- Reglas: RN-ACT-01..07 (sin cambios).
- Casos de prueba: UX-05 (sin desplazamiento horizontal a 375 px, aplicado también a las pantallas públicas) y las pruebas de componentes de las páginas de acceso.
- Depende de: US-061.
- Pedido directo del dueño del producto; en el Sprint 4B se **adelanta de la Ola 4 a la Ola 3**.
