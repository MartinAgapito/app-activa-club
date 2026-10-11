# US-060 — Ver la analítica de reservas y ocupación

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-060                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Frontend                                         |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Media                                            |
| Estimación relativa | 3                                                |
| Dependencias        | US-058                                           |

## Historia

Como **administrador**, quiero **ver gráficos de reservas por instalación, por día y horario, y de ocupación**, para **identificar las instalaciones y horarios más y menos usados**.

## Contrato de API

`GET /dashboard/admin` (US-058). Pantalla existente como placeholder: `/admin/analytics` (`AnalyticsPage`).

## Reglas de negocio

RN-ADM-08, RN-ANL-03, RN-ANL-04, RN-ANL-07.

## Valor de negocio

Es la vista que respalda decisiones operativas (horarios, mantenimientos) y la evidencia, para la directiva del club, de que la plataforma produce información que antes no existía.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Muestra las reservas por instalación del período, con el nombre de cada instalación (no su identificador interno) y ordenadas de mayor a menor.
2. Muestra la serie de reservas por día del período y, cuando el contrato lo incluya (US-058, criterio 3), la distribución por franja horaria.
3. Muestra la ocupación por instalación como porcentaje.
4. Indica de forma visible el período que cubren las cifras y la hora de referencia (Lima).
5. Cada gráfico tiene una alternativa accesible en texto o tabla con las mismas cifras; no depende solo del color.
6. Tiene estados de carga, error y vacío ("todavía no hay reservas en el período"); es responsive.
7. Si se incorpora una librería de gráficos, se elige por tamaño y accesibilidad y se justifica en el PR; no es un requisito funcional.

## Casos alternativos / excepciones

- **Elegir el período desde la pantalla, comparar períodos o exportar**: no está en el contrato; filtros de período son una mejora futura y la exportación es fase posterior (matriz §7).
- **Predicciones de demanda**: fase posterior (IA, matriz §7).

## Sugerencia de pruebas funcionales

- DA-05, DA-06, DA-09 por interfaz: las cifras del gráfico y de la tabla alternativa coinciden con la respuesta.
- Período sin reservas → estado vacío.
- T-02: navegación por teclado y lectura de la tabla alternativa.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-ADM-08, RN-ANL-03, RN-ANL-04, RN-ANL-07.
- Casos de prueba: DA-05, DA-06, DA-09, T-02.
- Depende de: US-058.
- Habilita: —
