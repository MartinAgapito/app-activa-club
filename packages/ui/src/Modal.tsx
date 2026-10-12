// Ventana modal base de la design foundation de Activa Club (US-062).
// Construida sobre la primitiva accesible de Radix UI (ADR-0013): foco
// atrapado y devuelto, Escape, bloqueo de scroll y ocultación del fondo a
// lectores de pantalla los resuelve la primitiva; aquí solo se aplican los
// tokens visuales y el contrato de la design foundation. Componente
// presentacional: sin reglas de negocio ni llamadas a la API.

import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from './cn';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título obligatorio: nombra la ventana (aria-labelledby). */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Zona de acciones fija al pie (botones). */
  footer?: ReactNode;
  size?: ModalSize;
  /**
   * `false` mientras una operación está en curso: Escape, clic fuera y botón
   * de cierre dejan de cerrar la ventana. Por defecto `true`.
   */
  dismissible?: boolean;
  /** Cierra con un clic fuera del panel. Por defecto `false` (no perder formularios a medias). */
  closeOnOverlayClick?: boolean;
  /** Muestra el botón de cierre (X) en la cabecera. Por defecto `true`. */
  showCloseButton?: boolean;
  /** Etiqueta accesible del botón de cierre. Por defecto "Cerrar". */
  closeLabel?: string;
  /** `alertdialog` para confirmaciones de acciones sensibles. Por defecto `dialog`. */
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  closeOnOverlayClick = false,
  showCloseButton = true,
  closeLabel = 'Cerrar',
  role = 'dialog',
  className,
}: ModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Control que tenía el foco al abrir. Radix solo devuelve el foco a un
  // `Dialog.Trigger`; como `Modal` es controlado (`open`), lo hacemos aquí.
  const openerRef = useRef<HTMLElement | null>(null);

  const blockOutside = (event: Event) => {
    if (!dismissible || !closeOnOverlayClick) event.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-modal-overlay="" className="fixed inset-0 z-layer-dialog bg-ink/50" />
        <Dialog.Content
          role={role}
          aria-modal="true"
          // Sin descripción no debe quedar un aria-describedby colgante.
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
            // Primer control del contenido; si no hay, el título.
            event.preventDefault();
            openerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const first = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
            (first ?? titleRef.current)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener?.isConnected) opener.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onPointerDownOutside={blockOutside}
          onInteractOutside={blockOutside}
          className={cn(
            // Móvil: pantalla completa. >= sm: panel centrado con ancho máximo.
            'fixed inset-0 z-layer-dialog flex flex-col bg-surface-card text-ink focus:outline-none',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:max-h-[calc(100dvh-2rem)] sm:rounded-dialog sm:shadow-dialog',
            sizeClasses[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="type-section-title text-ink focus:outline-none"
              >
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 type-aux text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            {showCloseButton ? (
              <Dialog.Close
                aria-label={closeLabel}
                disabled={!dismissible}
                className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-(--motion-fast) ease-(--motion-ease) hover:bg-surface-brand-soft focus-ring state-disabled"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </Dialog.Close>
            ) : null}
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 type-body">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
