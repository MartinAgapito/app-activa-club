// Mensajes de estado y ayudas de las pantallas de acceso (US-079).
// Nunca comunican solo con color: cada tono lleva icono y texto.

import type { ReactNode } from 'react';
import { cn } from '@activa-club/ui';

export type AuthAlertTone = 'error' | 'success' | 'info' | 'warning';

const toneClasses: Record<AuthAlertTone, string> = {
  error: 'bg-status-problem-soft text-status-problem',
  success: 'bg-status-confirmed-soft text-status-confirmed',
  warning: 'bg-status-pending-soft text-status-pending',
  info: 'bg-surface-brand-soft text-action',
};

const toneIconPaths: Record<AuthAlertTone, ReactNode> = {
  error: (
    <>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4.5M10 13.4v.1" />
    </>
  ),
  success: (
    <>
      <circle cx="10" cy="10" r="8" />
      <path d="m6.5 10.2 2.4 2.4 4.6-4.9" />
    </>
  ),
  warning: (
    <>
      <path d="M10 3 18 17H2L10 3Z" />
      <path d="M10 8v4M10 14.4v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v4.5M10 6.6v.1" />
    </>
  ),
};

export interface AuthAlertProps {
  tone: AuthAlertTone;
  children: ReactNode;
  className?: string;
}

/** Aviso dentro del formulario. Los errores usan `role="alert"` (se anuncian
 * de inmediato, aria-live assertive); éxito, información y alerta usan
 * `role="status"` (aria-live polite). Nunca mueve el foco. */
export function AuthAlert({ tone, children, className }: AuthAlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-control border-l-4 border-current px-3 py-2.5 text-sm',
        toneClasses[tone],
        className,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        className="mt-0.5 h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {toneIconPaths[tone]}
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Enlaces de recuperación dentro de un `AuthAlert`: subrayados para que no
 * dependan del color. */
export const alertLinkClass = 'rounded-sm font-semibold underline underline-offset-2 focus-ring';

export interface PasswordRequirementsProps {
  requirements: readonly string[];
}

/** Requisitos de contraseña, visibles antes de escribirla. */
export function PasswordRequirements({ requirements }: PasswordRequirementsProps) {
  return (
    <div className="mt-2 rounded-control bg-surface-raised px-3 py-2.5">
      <p className="type-aux font-medium text-ink">Tu contraseña debe tener:</p>
      <ul className="mt-1 list-inside list-disc type-aux text-ink-muted">
        {requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
    </div>
  );
}
