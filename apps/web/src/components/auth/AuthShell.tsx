// Composición de las pantallas de acceso (US-079): panel de marca + tarjeta de
// formulario. Desde 768 px son dos zonas lado a lado; por debajo se apilan
// (panel compacto arriba, formulario debajo) sin desplazamiento horizontal.
// Solo presentación: sin llamadas a la API ni reglas de negocio. Usa
// únicamente tokens de la design foundation v2.0 y no carga imágenes ni
// recursos externos (el motivo decorativo es CSS puro).

import type { ReactNode } from 'react';
import { Card } from '@activa-club/ui';

/** Clase de los enlaces de texto de acceso (acción de marca, subrayado al
 * pasar el puntero o enfocar). Los enlaces siempre llevan texto propio. */
export const authLinkClass =
  'rounded-sm font-medium text-action underline-offset-2 hover:underline focus-ring';

const BRAND_BENEFITS = [
  'Paga o renueva tu membresía en línea',
  'Reserva canchas e instalaciones desde tu celular',
  'Recibe avisos de tus reservas y vencimientos',
] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-5 w-5 shrink-0 text-positive-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="m6.5 10.2 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

function BrandPanel() {
  return (
    <aside
      aria-label="Sobre Activa Club"
      className="relative overflow-hidden rounded-card bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 px-5 py-5 text-ink-on-brand md:flex md:flex-col md:justify-between md:px-8 md:py-10"
    >
      {/* Motivo decorativo en CSS: arcos concéntricos de baja opacidad. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border-[28px] border-white/5"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 rounded-full border-[18px] border-white/5"
      />
      <div className="relative">
        <p className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Activa Club
        </p>
        <p className="mt-1 text-sm text-brand-50 md:mt-3 md:text-base">
          Tu membresía, tus pagos y tus reservas del club, en un solo lugar.
        </p>
      </div>
      <ul className="relative mt-8 hidden flex-col gap-3 text-sm text-brand-50 md:flex">
        {BRAND_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <CheckIcon />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export interface AuthShellProps {
  /** Título de la pantalla; es el único `h1` de la vista. */
  title: ReactNode;
  description?: ReactNode;
  /** Elemento breve sobre el título (p. ej. un `Badge` de estado). */
  eyebrow?: ReactNode;
  children?: ReactNode;
  /** Enlaces secundarios al pie de la tarjeta, separados por una línea. */
  footer?: ReactNode;
}

export function AuthShell({ title, description, eyebrow, children, footer }: AuthShellProps) {
  return (
    <div className="grid gap-5 py-2 md:min-h-[32rem] md:grid-cols-[minmax(0,1fr)_minmax(0,26.25rem)] md:gap-10 md:py-8 lg:gap-16">
      <BrandPanel />
      <section className="mx-auto flex w-full max-w-[26.25rem] flex-col justify-center md:mx-0">
        <Card className="p-6 sm:p-8">
          {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
          <h1 className="type-page-title text-ink">{title}</h1>
          {description ? <p className="mt-2 text-sm text-ink-muted">{description}</p> : null}
          <div className="mt-6 flex flex-col gap-4">{children}</div>
          {footer ? (
            <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 text-center text-sm text-ink-muted">
              {footer}
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
