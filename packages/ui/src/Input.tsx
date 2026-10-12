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
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-status-problem" aria-hidden="true">
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
          'h-11 rounded-control border border-line-strong bg-surface-card px-3 text-sm text-ink',
          'placeholder:text-ink-muted',
          'transition-colors duration-(--motion-fast) ease-(--motion-ease)',
          'focus:outline-none focus:ring-2 focus:ring-focus focus:border-focus',
          'disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-disabled',
          errorMessage &&
            'border-status-problem focus:ring-status-problem focus:border-status-problem',
          className,
        )}
        {...props}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-status-problem">
          {errorMessage}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-sm text-ink-muted">
          {helpText}
        </p>
      ) : null}
    </div>
  );
});
