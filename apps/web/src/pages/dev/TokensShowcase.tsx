// Muestra visible de los tokens de la design foundation (US-061).
// Solo se usa en /_dev/design-system. Los valores salen de las utilidades y
// variables definidas en src/styles/theme.css; no se duplican aquí.

import type { ReactNode } from 'react';
import { Card, CardHeader } from '@activa-club/ui';

const SURFACES = [
  { name: 'surface-app', className: 'bg-surface-app', note: 'Fondo de la aplicación' },
  { name: 'surface-card', className: 'bg-surface-card', note: 'Tarjetas y paneles' },
  { name: 'surface-raised', className: 'bg-surface-raised', note: 'Elevada / secundaria' },
  { name: 'surface-brand-soft', className: 'bg-surface-brand-soft', note: 'Marca suave' },
];

const TEXTS = [
  { name: 'ink', className: 'text-ink', note: 'Texto principal' },
  { name: 'ink-muted', className: 'text-ink-muted', note: 'Texto secundario' },
  { name: 'ink-disabled', className: 'text-ink-disabled', note: 'Deshabilitado (exento de AA)' },
  { name: 'ink-on-brand', className: 'bg-action text-ink-on-brand', note: 'Sobre color de marca' },
];

const STATUSES = [
  { name: 'confirmado', className: 'bg-status-confirmed-soft text-status-confirmed' },
  { name: 'pendiente', className: 'bg-status-pending-soft text-status-pending' },
  { name: 'problema', className: 'bg-status-problem-soft text-status-problem' },
];

const RADII = [
  { name: 'radius-control (8px)', className: 'rounded-control' },
  { name: 'radius-card (12px)', className: 'rounded-card' },
  { name: 'radius-dialog (14px)', className: 'rounded-dialog' },
];

const SHADOWS = [
  { name: 'shadow-card', className: 'shadow-card' },
  { name: 'shadow-panel', className: 'shadow-panel' },
  { name: 'shadow-dialog', className: 'shadow-dialog' },
  { name: 'shadow-toast', className: 'shadow-toast' },
];

const LAYERS = [
  { name: 'content', value: 0 },
  { name: 'header', value: 20 },
  { name: 'panel', value: 40 },
  { name: 'dialog', value: 50 },
  { name: 'toast', value: 80 },
];

const TYPE_ROLES = [
  { name: 'type-page-title', className: 'type-page-title', sample: 'Reservas de la semana' },
  { name: 'type-section-title', className: 'type-section-title', sample: 'Próximas reservas' },
  { name: 'type-card-title', className: 'type-card-title', sample: 'Cancha de tenis 2' },
  {
    name: 'type-body',
    className: 'type-body',
    sample: 'Tu membresía está al día. Puedes reservar hasta con 14 días de anticipación.',
  },
  { name: 'type-aux', className: 'type-aux', sample: 'Actualizado hace 5 minutos' },
  { name: 'type-figure', className: 'type-figure', sample: '18:30' },
];

function Swatch({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      {children}
      <figcaption className="type-aux text-ink-muted">{title}</figcaption>
    </figure>
  );
}

export function TokensShowcase() {
  return (
    <>
      <Card>
        <CardHeader title="Superficies y bordes" description="Tokens semánticos de color." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SURFACES.map((s) => (
            <Swatch key={s.name} title={`${s.name} — ${s.note}`}>
              <div className={`h-16 rounded-card border border-line ${s.className}`} />
            </Swatch>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Swatch title="line — separación decorativa">
            <div className="h-10 rounded-control border-2 border-line bg-surface-card" />
          </Swatch>
          <Swatch title="line-strong — borde de controles">
            <div className="h-10 rounded-control border-2 border-line-strong bg-surface-card" />
          </Swatch>
          <Swatch title="focus — anillo de foco">
            <div className="h-10 rounded-control border-2 border-focus bg-surface-card" />
          </Swatch>
        </div>
      </Card>

      <Card>
        <CardHeader title="Texto" />
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXTS.map((t) => (
            <p
              key={t.name}
              className={`rounded-control bg-surface-raised px-3 py-2 ${t.className}`}
            >
              <code className="type-aux">{t.name}</code> — {t.note}
            </p>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Estados semánticos"
          description="Texto sobre fondo suave; el color nunca es el único indicador."
        />
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((s) => (
            <span
              key={s.name}
              className={`rounded-control px-3 py-1.5 text-sm font-semibold ${s.className}`}
            >
              {s.name}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Escala tipográfica"
          description="Barlow Semi Condensed + Hanken Grotesk."
        />
        <div className="flex flex-col gap-4">
          {TYPE_ROLES.map((t) => (
            <div key={t.name} className="border-b border-line pb-3 last:border-b-0">
              <code className="type-aux text-ink-muted">{t.name}</code>
              <p className={`${t.className} measure text-ink`}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Radios y elevación" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {RADII.map((r) => (
            <Swatch key={r.name} title={r.name}>
              <div className={`h-16 border-2 border-line-strong bg-surface-card ${r.className}`} />
            </Swatch>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SHADOWS.map((s) => (
            <Swatch key={s.name} title={s.name}>
              <div className={`h-16 rounded-card bg-surface-card ${s.className}`} />
            </Swatch>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Capas"
          description="Orden único: contenido < cabecera fija < panel lateral < ventana < aviso efímero."
        />
        <ol className="flex flex-wrap gap-3">
          {LAYERS.map((l) => (
            <li
              key={l.name}
              className="rounded-control border border-line-strong bg-surface-raised px-3 py-1.5 text-sm"
            >
              <code>z-layer-{l.name}</code> = <span className="font-semibold">{l.value}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader
          title="Estados de interacción y movimiento"
          description="Pasa el cursor, presiona o usa Tab. Con 'reducir movimiento' activado no hay transición."
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="focus-ring rounded-control bg-action px-4 py-2 text-ink-on-brand transition-colors duration-(--motion-fast) ease-(--motion-ease) hover:bg-action-hover active:bg-action-pressed"
          >
            Hover 120ms / presionado
          </button>
          <button
            type="button"
            className="focus-ring rounded-control bg-surface-brand-soft px-4 py-2 text-action transition-colors duration-(--motion-base) ease-(--motion-ease) hover:bg-brand-100"
          >
            Transición 200ms
          </button>
          <button
            type="button"
            disabled
            className="state-disabled rounded-control bg-action px-4 py-2 text-ink-on-brand"
          >
            Deshabilitado
          </button>
        </div>
      </Card>
    </>
  );
}
