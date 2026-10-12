// Inicio institucional (público). Contenido estático derivado de
// docs/product/vision-y-objetivos.md — sin datos ni llamadas a la API.
// Estilo: US-079 (tokens de la design foundation v2.0, sin imágenes externas).

import { Link } from 'react-router-dom';
import { buttonVariants } from '@activa-club/ui';

const VALUE_PROPS = [
  {
    title: 'Membresías y pagos en línea',
    description: 'Consulta tu estado de membresía y paga o renueva con tarjeta, sin filas.',
  },
  {
    title: 'Reservas sin fricción',
    description:
      'Reserva fútbol, tenis, pádel, piscina, parrillas y salón social desde tu celular.',
  },
  {
    title: 'Siempre informado',
    description: 'Notificaciones y correos sobre pagos, reservas y vencimientos de tu membresía.',
  },
];

export function HomePage() {
  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      <section className="relative overflow-hidden rounded-card bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-10 text-ink-on-brand sm:px-10 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full border-[32px] border-white/5"
        />
        <div className="relative flex flex-col items-start gap-5">
          <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Tu club deportivo, ahora en tu bolsillo.
          </h1>
          <p className="measure text-base text-brand-50 sm:text-lg">
            Activa Club digitaliza tu membresía, tus pagos y tus reservas de instalaciones, para que
            gestiones todo desde cualquier lugar.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/activar-cuenta"
              className={buttonVariants({
                variant: 'secondary',
                size: 'lg',
                className: 'border-transparent',
              })}
            >
              Ya soy socio, activar cuenta
            </Link>
            <Link
              to="/registro"
              className="inline-flex h-12 items-center justify-center rounded-control border border-white/60 px-6 text-base font-medium text-ink-on-brand transition-colors duration-(--motion-fast) ease-(--motion-ease) hover:bg-white/10 focus-ring"
            >
              Quiero ser socio nuevo
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Beneficios">
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {VALUE_PROPS.map((item) => (
            <li key={item.title} className="border-t-2 border-action pt-4">
              <h2 className="type-card-title text-ink">{item.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
