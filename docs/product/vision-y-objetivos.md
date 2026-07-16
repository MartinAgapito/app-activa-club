# Visión y Objetivos — Activa Club

> Documento derivado del [Contexto Maestro](./contexto-maestro.md). El Contexto Maestro es la fuente única de verdad; este documento lo traduce en una visión accionable para todo el equipo. Si hay conflicto, prevalece el Contexto Maestro.

## 1. Visión del producto

Activa Club es una plataforma web responsive que moderniza la operación de un club deportivo privado, migrando su información desde un sistema on-premise hacia una arquitectura cloud en AWS. Permite a socios y administradores gestionar membresías, pagos, reservas de instalaciones, notificaciones y analítica desde cualquier ubicación.

**Declaración de visión:**

> Para los socios y administradores de un club deportivo privado que hoy dependen de un sistema on-premise, Activa Club es una plataforma web cloud que digitaliza membresías, pagos y reservas de instalaciones, entregando autonomía al socio y visibilidad operativa al administrador, a diferencia de la gestión manual y presencial actual.

## 2. Objetivo del proyecto

Demostrar la migración de información de un sistema on-premise a AWS y habilitar una experiencia digital para socios: activación de cuenta, membresías, pagos, reservas, notificaciones y dashboards.

El producto se llama exactamente: **Activa Club**.

## 3. Objetivos de negocio

| ID    | Objetivo                                                                       | Cómo se evidencia                                                                         |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| OBJ-1 | Migrar la base de socios legado hacia una fuente de datos operativa en la nube | Socios del JSON on-premise disponibles en DynamoDB con identificador legado               |
| OBJ-2 | Dar autonomía al socio para autoservicio                                       | El socio activa cuenta, paga y reserva sin intervención presencial                        |
| OBJ-3 | Digitalizar los pagos de membresía                                             | Pagos con tarjeta vía Culqi sandbox que actualizan el estado de membresía de forma segura |
| OBJ-4 | Ordenar el uso de instalaciones con reglas de aforo y horarios                 | Reservas sin cruces, sin sobreaforo y con aprobación cuando corresponde                   |
| OBJ-5 | Dar visibilidad operativa al administrador                                     | Dashboard de analítica con métricas de socios, reservas y pagos                           |
| OBJ-6 | Mantener comunicación con el socio                                             | Notificaciones internas y correos transaccionales para eventos relevantes                 |

## 4. Usuarios y roles

| Rol           | Código   | Descripción                                                                                |
| ------------- | -------- | ------------------------------------------------------------------------------------------ |
| Socio         | `member` | Persona con membresía. Activa cuenta, paga, reserva y recibe notificaciones.               |
| Administrador | `admin`  | Gestiona socios, aprueba solicitudes y reservas, administra recursos y consulta analítica. |

El diseño debe permitir agregar múltiples administradores más adelante.

## 5. Propuesta de valor por rol

**Para el socio:**

- Activa su cuenta con su DNI (si es socio migrado) o se registra como socio nuevo.
- Consulta el estado de su membresía y paga o renueva en línea.
- Reserva instalaciones e invita a otros socios o invitados externos.
- Recibe notificaciones y correos sobre pagos, reservas y vencimientos.

**Para el administrador:**

- Gestiona socios migrados y nuevos, aprobando o rechazando solicitudes.
- Administra recursos, aforos, horarios y mantenimiento.
- Aprueba o rechaza reservas de parrillas y salón social.
- Publica notificaciones segmentadas y consulta métricas operativas.

## 6. Métricas de éxito del MVP

- Migración ejecutada sin pérdida de socios ni de estado legado.
- Un socio migrado puede activar cuenta, pagar y reservar de extremo a extremo.
- Un socio nuevo puede registrarse, ser aprobado, pagar su primera membresía y reservar.
- Las reglas críticas (aforo, cruces, deuda, cancelación 24h, aprobación de recursos) se cumplen del lado del backend.
- El administrador visualiza métricas en el dashboard de analítica.

## 7. Restricciones y principios rectores

- MVP primero; IA, QR, lista de espera, WhatsApp y predicciones quedan para fases posteriores.
- Bajo costo, seguridad, serverless y simplicidad para el MVP.
- Ninguna regla crítica debe depender únicamente del frontend.
- Toda infraestructura AWS debe existir en Terraform; sin cambios manuales en consola.
- Nunca almacenar contraseñas, datos de tarjeta, CVV ni secretos de Culqi en la base de datos.

## 8. Referencias

- [Contexto Maestro](./contexto-maestro.md)
- [Matriz de alcance](./matriz-de-alcance.md)
- [Reglas de negocio](./reglas-de-negocio.md)
