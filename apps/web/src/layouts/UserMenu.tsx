import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleUserRound, LogOut, UserRound } from 'lucide-react';

export interface UserMenuProps {
  name: string;
  roleLabel: string;
  /** Ruta de "Mi perfil" (solo socio). */
  profileTo?: string;
  onSignOut: () => void;
}

const itemClass =
  'flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-brand-soft focus-ring';

/**
 * Menú de usuario de la cabecera: disclosure accesible (botón con
 * `aria-expanded`), se cierra con Escape, con un clic fuera o al elegir una
 * opción; al cerrar con Escape devuelve el foco al botón.
 */
export function UserMenu({ name, roleLabel, profileTo, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Menú de usuario: ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-ink hover:bg-surface-brand-soft focus-ring"
      >
        <CircleUserRound aria-hidden="true" className="size-6 text-action" />
        <span aria-hidden="true" className="hidden max-w-40 truncate sm:inline">
          {name}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-ink-muted" />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-full z-layer-panel mt-2 w-60 rounded-card border border-line bg-surface-card p-2 shadow-panel"
        >
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="type-aux text-ink-muted">{roleLabel}</p>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {profileTo ? (
              <Link to={profileTo} className={itemClass} onClick={() => setOpen(false)}>
                <UserRound aria-hidden="true" className="size-5 text-ink-muted" />
                Mi perfil
              </Link>
            ) : null}
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut aria-hidden="true" className="size-5 text-ink-muted" />
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
