// Bloques de detalle (sección con lista de pares etiqueta/valor) para los
// paneles laterales del administrador.

import type { ReactNode } from 'react';

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="type-card-title text-ink">{title}</h3>
      <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function DetailItem({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="type-aux text-ink-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}
