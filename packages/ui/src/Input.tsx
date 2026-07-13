// Input de formulario accesible de la design foundation de Activa Club.
// Sin validaciones de negocio: solo presentación, asociación label/error y
// compatibilidad con `forwardRef` para integrarse con React Hook Form.

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Mensaje de error de validación (se asocia vía `aria-describedby` y `aria-invalid`). */
  errorMessage?: string | undefined;
  /** Texto de ayuda contextual, visible cuando no hay error. */
  helpText?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, errorMessage, helpText, id, required, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const describedBy = errorMessage ? errorId : helpText ? helpId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={Boolean(errorMessage) || undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900',
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
