// Verifica el contraste WCAG 2.1 AA de los pares texto/fondo de la design
// foundation (US-061). Lee los valores reales de src/styles/theme.css para que
// la tabla de design-foundation.md §3.5 no se desfase.
// Uso: node apps/web/scripts/check-contrast.mjs  (sale con código 1 si algún par falla)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]),
);

const channel = (hex, i) => {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) =>
  0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [descripción, primer plano, fondo, mínimo requerido]
const PAIRS = [
  ['Texto principal / app', 'ink', 'surface-app', 4.5],
  ['Texto principal / tarjeta', 'ink', 'surface-card', 4.5],
  ['Texto principal / elevada', 'ink', 'surface-raised', 4.5],
  ['Texto principal / marca suave', 'ink', 'surface-brand-soft', 4.5],
  ['Texto secundario / app', 'ink-muted', 'surface-app', 4.5],
  ['Texto secundario / tarjeta', 'ink-muted', 'surface-card', 4.5],
  ['Texto secundario / elevada', 'ink-muted', 'surface-raised', 4.5],
  ['Texto secundario / marca suave', 'ink-muted', 'surface-brand-soft', 4.5],
  ['Texto sobre marca / acción', 'ink-on-brand', 'action', 4.5],
  ['Texto sobre marca / acción hover', 'ink-on-brand', 'action-hover', 4.5],
  ['Texto sobre marca / acción presionada', 'ink-on-brand', 'action-pressed', 4.5],
  ['Acción (enlace, secundario) / tarjeta', 'action', 'surface-card', 4.5],
  ['Acción (enlace) / app', 'action', 'surface-app', 4.5],
  ['Acción / marca suave', 'action', 'surface-brand-soft', 4.5],
  ['Confirmado / fondo suave', 'status-confirmed', 'status-confirmed-soft', 4.5],
  ['Pendiente / fondo suave', 'status-pending', 'status-pending-soft', 4.5],
  ['Problema / fondo suave', 'status-problem', 'status-problem-soft', 4.5],
  ['Problema (error en formulario) / tarjeta', 'status-problem', 'surface-card', 4.5],
  ['Problema (error) / app', 'status-problem', 'surface-app', 4.5],
  ['Texto sobre botón positivo', 'ink-on-brand', 'color-positive-700', 4.5],
  ['Texto sobre botón destructivo', 'ink-on-brand', 'status-problem', 4.5],
  ['Texto sobre botón alerta', 'color-warning-900', 'color-warning-500', 4.5],
  ['Texto sobre botón alerta hover', 'color-warning-900', 'color-warning-400', 4.5],
  ['Foco / tarjeta (no texto)', 'line-focus', 'surface-card', 3],
  ['Foco / app (no texto)', 'line-focus', 'surface-app', 3],
  ['Foco / marca suave (no texto)', 'line-focus', 'surface-brand-soft', 3],
  ['Borde de control / tarjeta (no texto)', 'line-strong', 'surface-card', 3],
  ['Borde de control / app (no texto)', 'line-strong', 'surface-app', 3],
];

let failed = 0;
console.log('| Par | Primer plano | Fondo | Ratio | Mínimo | Resultado |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const [name, fg, bg, min] of PAIRS) {
  const a = tokens[fg];
  const b = tokens[bg];
  if (!a || !b) throw new Error(`Token no encontrado: ${fg} / ${bg}`);
  const r = ratio(a, b);
  const ok = r >= min;
  if (!ok) failed += 1;
  console.log(
    `| ${name} | ${a} | ${b} | ${r.toFixed(2)}:1 | ${min}:1 | ${ok ? 'cumple' : 'FALLA'} |`,
  );
}
process.exit(failed ? 1 : 0);
