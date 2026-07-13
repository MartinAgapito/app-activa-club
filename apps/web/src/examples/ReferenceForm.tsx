// Formulario de referencia: React Hook Form + Zod resolver + componentes de
// @activa-club/ui. Patrón mínimo para Sprint 1 (no es una pantalla de
// negocio real ni llama a la API — ver docs/mapa-de-rutas.md, sección
// "Herramientas internas de desarrollo").

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Button, Card, CardHeader, Input } from '@activa-club/ui';
import { referenceFormSchema, type ReferenceFormValues } from './reference-form-schema';

export function ReferenceForm() {
  const [submitted, setSubmitted] = useState<ReferenceFormValues | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReferenceFormValues>({
    resolver: zodResolver(referenceFormSchema),
    defaultValues: { fullName: '', email: '', message: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Sin llamada a la API: simula una operación asíncrona para demostrar el
    // estado `isSubmitting` de React Hook Form.
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSubmitted(values);
    reset();
  });

  return (
    <Card>
      <CardHeader
        title="Formulario de referencia"
        description="Patrón RHF + Zod + @activa-club/ui para Sprint 1. No envía datos a ningún servidor."
      />
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Nombre completo"
          required
          {...register('fullName')}
          errorMessage={errors.fullName?.message}
        />
        <Input
          label="Correo electrónico"
          type="email"
          required
          {...register('email')}
          errorMessage={errors.email?.message}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="message" className="text-sm font-medium text-slate-700">
            Mensaje
          </label>
          <textarea
            id="message"
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-invalid={Boolean(errors.message) || undefined}
            aria-describedby={errors.message ? 'message-error' : undefined}
            {...register('message')}
          />
          {errors.message ? (
            <p id="message-error" role="alert" className="text-sm text-danger-600">
              {errors.message.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" isLoading={isSubmitting}>
          Enviar
        </Button>
      </form>
      {submitted ? (
        <p className="mt-4 text-sm text-positive-700" role="status">
          Enviado (simulado): {submitted.fullName} — {submitted.email}
        </p>
      ) : null}
    </Card>
  );
}
