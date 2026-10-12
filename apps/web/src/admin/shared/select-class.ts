// Clases del `<select>` nativo de las pantallas administrativas: mismos
// tokens que `Input` (borde, foco, altura táctil de 44 px) para que los
// selectores de instalación se vean como el resto de los campos.

export const SELECT_CLASS =
  'block h-11 w-full rounded-control border border-line-strong bg-surface-card px-3 text-sm text-ink ' +
  'transition-colors duration-(--motion-fast) ease-(--motion-ease) ' +
  'focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus ' +
  'disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-disabled';
