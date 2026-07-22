// Textarea de formulario accesible de la design foundation de Activa Club.
// Mismo patrón que Input.tsx (label asociado, error vía aria-describedby),
// pensado para campos de texto libre más largos (p. ej. motivo de rechazo).

import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  /** Mensaje de error de validación (se asocia vía `aria-describedby` y `aria-invalid`). */
  errorMessage?: string | undefined;
  /** Texto de ayuda contextual, visible cuando no hay error. */
  helpText?: string | undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, errorMessage, helpText, id, required, className, rows = 4, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  const helpId = `${textareaId}-help`;
  const describedBy = errorMessage ? errorId : helpText ? helpId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={Boolean(errorMessage) || undefined}
        aria-describedby={describedBy}
        className={cn(
          'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
          'placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400',
          errorMessage && 'border-danger-500 focus:ring-danger-500 focus:border-danger-500',
          className,
        )}
        {...props}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-danger-600">
          {errorMessage}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-sm text-slate-500">
          {helpText}
        </p>
      ) : null}
    </div>
  );
});
