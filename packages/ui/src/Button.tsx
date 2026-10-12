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
  'inline-flex items-center justify-center gap-2 rounded-control font-medium ' +
  'transition-colors duration-(--motion-fast) ease-(--motion-ease) focus-ring state-disabled';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-action text-ink-on-brand hover:bg-action-hover active:bg-action-pressed',
  positive: 'bg-positive-700 text-ink-on-brand hover:bg-positive-800 active:bg-positive-900',
  warning: 'bg-warning-500 text-warning-900 hover:bg-warning-400 active:bg-warning-300',
  danger: 'bg-status-problem text-ink-on-brand hover:bg-danger-600 active:bg-danger-700',
  secondary:
    'bg-surface-card text-action border border-line-strong hover:bg-surface-brand-soft active:bg-brand-100',
  ghost: 'bg-transparent text-action hover:bg-surface-brand-soft active:bg-brand-100',
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
