// Inicio institucional (público). Contenido estático derivado de
// docs/product/vision-y-objetivos.md — sin datos ni llamadas a la API.

import { Link } from 'react-router-dom';
import { Card, buttonVariants } from '@activa-club/ui';

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
    <div className="flex flex-col gap-16">
      <section className="flex flex-col items-start gap-6 py-8 sm:py-16">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">
          Tu club deportivo, ahora en tu bolsillo.
        </h1>
        <p className="max-w-xl text-base text-slate-600 sm:text-lg">
          Activa Club digitaliza tu membresía, tus pagos y tus reservas de instalaciones, para que
          gestiones todo desde cualquier lugar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/activar-cuenta" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            Ya soy socio, activar cuenta
          </Link>
          <Link to="/registro" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Quiero ser socio nuevo
          </Link>
        </div>
      </section>

      <section aria-label="Beneficios" className="grid gap-4 sm:grid-cols-3">
        {VALUE_PROPS.map((item) => (
          <Card key={item.title} compact>
            <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
