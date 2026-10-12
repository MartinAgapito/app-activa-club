// Panel lateral (drawer) de la design foundation de Activa Club (US-063).
// Misma primitiva accesible que Modal (ADR-0013): foco atrapado, Escape,
// bloqueo de scroll y ocultación del fondo los resuelve Radix; aquí se aplican
// el posicionamiento al borde, la animación y el contrato de foco de Modal
// (foco inicial en el primer control o en el título, devuelto al abridor).
// Componente presentacional: sin reglas de negocio ni llamadas a la API.
// Mientras el contenido carga, el llamador muestra un Spinner dentro: el panel
// no espera a los datos para abrirse.

import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from './cn';

export type DrawerSide = 'right' | 'left';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título obligatorio: nombra el panel (aria-labelledby). */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Zona de acciones fija al pie (botones). */
  footer?: ReactNode;
  /** Borde de origen: `right` para detalle, `left` para el menú de navegación móvil. */
  side?: DrawerSide;
  /**
   * `false` mientras una operación está en curso: Escape, clic fuera y botón
   * de cierre dejan de cerrar el panel. Por defecto `true`.
   */
  dismissible?: boolean;
  /** Cierra con un clic en el fondo atenuado. Por defecto `true`. */
  closeOnOverlayClick?: boolean;
  /** Muestra el botón de cierre (X) en la cabecera. Por defecto `true`. */
  showCloseButton?: boolean;
  /** Etiqueta accesible del botón de cierre. Por defecto "Cerrar". */
  closeLabel?: string;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Los keyframes `drawer-*` (theme.css) usan los tokens de movimiento. Radix
// espera a que termine la animación de salida antes de desmontar; con
// `motion-reduce:animate-none` no hay animación y se desmonta de inmediato.
const sideClasses: Record<DrawerSide, string> = {
  right:
    'right-0 border-l data-[state=open]:animate-drawer-in-right data-[state=closed]:animate-drawer-out-right',
  left: 'left-0 border-r data-[state=open]:animate-drawer-in-left data-[state=closed]:animate-drawer-out-left',
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  dismissible = true,
  closeOnOverlayClick = true,
  showCloseButton = true,
  closeLabel = 'Cerrar',
  className,
}: DrawerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Radix solo devuelve el foco a un `Dialog.Trigger`; al ser controlado,
  // recordamos el control que lo tenía al abrir (igual que Modal).
  const openerRef = useRef<HTMLElement | null>(null);

  const blockOutside = (event: Event) => {
    if (!dismissible || !closeOnOverlayClick) event.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-drawer-overlay=""
          className={cn(
            'fixed inset-0 z-layer-panel bg-ink/50',
            'data-[state=open]:animate-drawer-fade-in data-[state=closed]:animate-drawer-fade-out',
            'motion-reduce:animate-none',
          )}
        />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          data-drawer-side={side}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(event) => {
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
            // <640px: todo el ancho. >=640px: ancho fijo de 480px (30rem).
            'fixed inset-y-0 z-layer-panel flex w-full flex-col border-line bg-surface-card text-ink shadow-dialog focus:outline-none sm:max-w-[30rem]',
            'motion-reduce:animate-none',
            sideClasses[side],
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
