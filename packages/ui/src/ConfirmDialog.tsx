// Diálogo de confirmación base de la design foundation de Activa Club.
// Reutilizable por cualquier acción irreversible o sensible que requiera una
// confirmación explícita del usuario antes de ejecutarse (p. ej. aprobar o
// rechazar una solicitud, cancelar una reserva). Componente puramente
// presentacional: no decide reglas de negocio ni realiza llamadas a la API.
// Construido sobre `Modal` (US-062): conserva su API pública y `alertdialog`.

import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Modal } from './Modal';

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
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      role="alertdialog"
      size="sm"
      title={title}
      description={description}
      showCloseButton={false}
      closeOnOverlayClick
      footer={
        <>
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
        </>
      }
    >
      {children}
    </Modal>
  );
}
