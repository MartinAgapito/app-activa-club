// Logger estructurado para CloudWatch (ADR-0008).
//
// Cada Lambda emite logs JSON de una línea con, como mínimo, los campos:
// timestamp, level, requestId, route, actorSub, role, entityType, action,
// outcome, latencyMs. Sin PII innecesaria, sin datos de tarjeta ni secretos:
// nunca pasar `culqiToken`, contraseñas ni el body crudo de un pago como campo.

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type LogOutcome = 'SUCCESS' | 'FAILURE';

/** Campos estructurados de un evento de log (ADR-0008). */
export interface LogFields {
  requestId: string;
  route?: string;
  actorSub?: string;
  role?: string;
  entityType?: string;
  action?: string;
  outcome?: LogOutcome;
  latencyMs?: number;
  [extra: string]: unknown;
}

/** Claves que nunca deben aparecer en un log (defensa en profundidad). */
const FORBIDDEN_KEYS = new Set(['password', 'culqiToken', 'cvv', 'cardNumber', 'culqiSecretKey']);

function sanitize(fields: LogFields): LogFields {
  const clean: LogFields = { requestId: fields.requestId };
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitize(fields),
  };
  // Escritura directa a stdout (capturada por CloudWatch Logs en Lambda);
  // se evita `console.log` para no chocar con la regla `no-console` del lint,
  // reservada para advertencias/errores reales de desarrollo.
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  info(message: string, fields: LogFields): void {
    emit('INFO', message, fields);
  },
  warn(message: string, fields: LogFields): void {
    emit('WARN', message, fields);
  },
  error(message: string, fields: LogFields): void {
    emit('ERROR', message, fields);
  },
};
