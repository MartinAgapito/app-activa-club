// Botón base de la design foundation de Activa Club.
// Componente puramente presentacional: sin llamadas a API ni reglas de negocio.

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'positive' | 'warning' | 'danger' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Intención visual del botón. `positive` para acciones de confirmación/pago,
   * `danger` para acciones destructivas o relacionadas a deuda/errores. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra un spinner y deshabilita el botón mientras una acción está en curso. */
  isLoading?: boolean;
  /** Expande el botón al 100% del ancho disponible (útil en formularios móviles). */
  fullWidth?: boolean;
}

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-500',
  positive: 'bg-positive-600 text-white hover:bg-positive-700 focus-visible:ring-positive-500',
  warning: 'bg-warning-500 text-warning-900 hover:bg-warning-600 focus-visible:ring-warning-400',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500',
  secondary:
    'bg-white text-brand-800 border border-brand-200 hover:bg-brand-50 focus-visible:ring-brand-400',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-400',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export interface ButtonVariantsOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string | undefined;
}

/** Genera las clases visuales del botón para reutilizarlas en elementos que
 * no son `<button>` (p. ej. `<Link>` de react-router-dom usado como acción
 * primaria). Evita anidar un `<a>` dentro de un `<button>`. */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonVariantsOptions = {}): string {
  return cn(
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={buttonVariants({ variant, size, fullWidth, className })}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
});
