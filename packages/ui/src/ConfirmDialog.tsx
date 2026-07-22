// Diálogo de confirmación base de la design foundation de Activa Club.
// Reutilizable por cualquier acción irreversible o sensible que requiera una
// confirmación explícita del usuario antes de ejecutarse (p. ej. aprobar o
// rechazar una solicitud, cancelar una reserva). Componente puramente
// presentacional: no decide reglas de negocio ni realiza llamadas a la API.

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { cn } from './cn';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Contenido adicional entre la descripción y las acciones (p. ej. un campo de motivo). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Intención visual de la acción a confirmar. `danger` para rechazos/cancelaciones. */
  confirmVariant?: ButtonVariant;
  /** Deshabilita el botón de confirmar (p. ej. mientras no se completó un campo obligatorio). */
  confirmDisabled?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  confirmDisabled = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // `onCancel` suele ser una función inline nueva en cada render del llamador;
  // se guarda en un ref para no reejecutar el efecto de foco (y así no robar
  // el foco) en cada tecleo dentro del diálogo (p. ej. al escribir el motivo
  // de rechazo). Se actualiza en un efecto, nunca durante el render.
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancelRef.current();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        tabIndex={-1}
        className={cn('w-full max-w-md rounded-2xl bg-white p-6 shadow-lg', 'focus:outline-none')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {description ? (
          <p id="confirm-dialog-description" className="mt-2 text-sm text-slate-600">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
