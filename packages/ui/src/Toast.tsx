// Avisos efímeros (toast) de la design foundation de Activa Club (US-066).
//
// Confirman el resultado inmediato de una acción del propio usuario ("Reserva
// confirmada") sin interrumpir su trabajo. NO son las notificaciones de EP-05
// (bandeja persistente y correo): un aviso no se guarda ni conoce la API ni
// reglas de negocio. Implementación propia con regiones ARIA live, sin
// dependencias nuevas.
//
// Convención de texto: el mensaje reutiliza el verbo del botón que originó la
// acción, en participio ("Reservar cancha" -> "Cancha reservada"; "Liberar
// bloqueo" -> "Bloqueo liberado"; "Aprobar solicitud" -> "Solicitud aprobada").
//
// Uso:
//   const toast = useToast();
//   toast.success('Reserva confirmada', { action: { label: 'Ver en Mis reservas', onClick } });

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { cn } from './cn';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Identificador propio: un aviso con el mismo id reemplaza al anterior (evita duplicados). */
  id?: string;
  /** Milisegundos hasta el auto-cierre. `null` = permanece hasta cerrarse. Por defecto 5000; en errores `null`. */
  duration?: number | null;
  /** Acción opcional (p. ej. "Ver en Mis reservas"). Al activarla el aviso se cierra. */
  action?: ToastAction;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  /** Cierra un aviso por id, o todos si no se indica. */
  dismiss: (id?: string) => void;
}

interface ToastItemData {
  id: string;
  type: ToastType;
  message: string;
  duration: number | null;
  action?: ToastAction;
}

export const TOAST_DEFAULT_DURATION_MS = 5000;
export const TOAST_MAX_VISIBLE = 3;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast debe usarse dentro de un <ToastProvider>.');
  }
  return api;
}

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id?: string) => {
    setToasts((current) => (id === undefined ? [] : current.filter((t) => t.id !== id)));
  }, []);

  const api = useMemo<ToastApi>(() => {
    function push(type: ToastType, message: string, options: ToastOptions = {}): string {
      counter.current += 1;
      const id = options.id ?? `toast-${counter.current}`;
      const duration =
        options.duration !== undefined
          ? options.duration
          : type === 'error'
            ? null
            : TOAST_DEFAULT_DURATION_MS;
      const item: ToastItemData = {
        id,
        type,
        message,
        duration,
        ...(options.action ? { action: options.action } : {}),
      };
      setToasts((current) =>
        [...current.filter((t) => t.id !== id), item].slice(-TOAST_MAX_VISIBLE),
      );
      return id;
    }
    return {
      success: (message, options) => push('success', message, options),
      info: (message, options) => push('info', message, options),
      warning: (message, options) => push('warning', message, options),
      error: (message, options) => push('error', message, options),
      dismiss,
    };
  }, [dismiss]);

  // Dos regiones persistentes (montadas siempre, para que los lectores de
  // pantalla anuncien lo que se inserta): cortés para éxito/info/alerta y
  // asertiva para errores. No reciben foco ni lo mueven.
  const polite = toasts.filter((t) => t.type !== 'error');
  const assertive = toasts.filter((t) => t.type === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-testid="toast-viewport"
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-layer-toast flex flex-col items-center gap-2',
          'px-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
          'sm:inset-x-auto sm:right-0 sm:items-end sm:px-6 sm:pb-6',
          // Con una ventana o panel abierto (Radix marca el body con
          // `data-scroll-locked`) el aviso sube sobre la zona de acciones fija
          // al pie para no tapar los botones del diálogo.
          '[body[data-scroll-locked]_&]:pb-[calc(6rem+env(safe-area-inset-bottom))]',
        )}
      >
        <div aria-live="polite" className="contents">
          {polite.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div aria-live="assertive" className="contents">
          {assertive.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const typeStyles: Record<ToastType, { container: string; icon: string; label: string }> = {
  success: {
    container: 'border-status-confirmed bg-status-confirmed-soft',
    icon: 'text-status-confirmed',
    label: 'Éxito',
  },
  info: {
    container: 'border-action bg-surface-brand-soft',
    icon: 'text-action',
    label: 'Información',
  },
  warning: {
    container: 'border-status-pending bg-status-pending-soft',
    icon: 'text-status-pending',
    label: 'Atención',
  },
  error: {
    container: 'border-status-problem bg-status-problem-soft',
    icon: 'text-status-problem',
    label: 'Error',
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'h-5 w-5 shrink-0',
  };
  if (type === 'success') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.8L16 9.5" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg {...common}>
        <path d="M12 4 2.8 19.5h18.4L12 4Z" />
        <path d="M12 10v4.5M12 17.5h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </svg>
  );
}

interface ToastItemProps {
  toast: ToastItemData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { id, type, message, duration, action } = toast;
  const styles = typeStyles[type];
  const [paused, setPaused] = useState(false);
  const [entered, setEntered] = useState(false);
  const remaining = useRef<number | null>(duration);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (duration === null || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismissRef.current(id), remaining.current ?? duration);
    return () => {
      clearTimeout(timer);
      if (remaining.current !== null) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
      }
    };
  }, [id, duration, paused]);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setPaused(false);
  }

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      data-toast-type={type}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={handleBlur}
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border-l-4 p-3 text-ink shadow-toast',
        'transition-[opacity,transform] duration-(--motion-base) ease-(--motion-ease)',
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        styles.container,
      )}
    >
      <span className={styles.icon}>
        <ToastIcon type={type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <span className="sr-only">{styles.label}: </span>
          {message}
        </p>
        {action ? (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              onDismiss(id);
            }}
            className="focus-ring mt-1 rounded-control text-sm font-semibold text-action underline underline-offset-2"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => onDismiss(id)}
        className="focus-ring -m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
