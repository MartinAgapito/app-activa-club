// Estructura de aplicación autenticada (US-068): barra lateral de 232 px en
// escritorio, cabecera ligera con el título de la sección y el menú de
// usuario, y, por debajo de 760 px, la navegación dentro de un Drawer
// izquierdo abierto desde un botón de menú. Compartida por socio y
// administrador; cada layout solo aporta su navegación y datos de usuario.
// El contenido (`<main id>`) conserva el ancho y los gutters de `PageLayout`.

import { useEffect, useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom';
import { Activity, Menu } from 'lucide-react';
import { Drawer } from '@activa-club/ui';
import { SkipLink } from './SkipLink';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';
import { MAIN_CONTENT_ID, type NavItem } from './navigation';

export interface AppShellProps {
  items: NavItem[];
  /** Nombre accesible del `<nav>` (distinto por rol). */
  navLabel: string;
  /** Destino del logotipo. */
  homeTo: string;
  userName: string;
  roleLabel: string;
  profileTo?: string;
  onSignOut: () => void;
}

/** Media query equivalente al breakpoint `shell` (47.5rem = 760 px). */
const DESKTOP_QUERY = '(min-width: 47.5rem)';

function Brand({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-control font-display text-lg font-semibold text-brand-800 focus-ring"
    >
      <Activity aria-hidden="true" className="size-6 text-action" />
      Activa Club
    </Link>
  );
}

function UserBlock({ name, roleLabel }: { name: string; roleLabel: string }) {
  return (
    <div className="border-t border-line px-4 py-4">
      <p className="truncate text-sm font-semibold text-ink">{name}</p>
      <p className="type-aux text-ink-muted">{roleLabel}</p>
    </div>
  );
}

export function AppShell({
  items,
  navLabel,
  homeTo,
  userName,
  roleLabel,
  profileTo,
  onSignOut,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Si la ventana pasa a escritorio con el menú abierto, se cierra.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const current = items.find((item) =>
    matchPath({ path: item.to, end: item.end ?? false }, pathname),
  );
  const sectionTitle = current?.label ?? items[0]?.label ?? 'Activa Club';

  return (
    <div className="min-h-screen bg-surface-app text-ink shell:flex">
      <SkipLink />
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 flex-col border-r border-line bg-surface-raised shell:flex">
        <div className="px-4 py-5">
          <Brand to={homeTo} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav items={items} label={navLabel} />
        </div>
        <UserBlock name={userName} roleLabel={roleLabel} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-layer-header flex h-16 items-center gap-3 border-b border-line bg-surface-card/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface-brand-soft focus-ring shell:hidden"
          >
            <Menu aria-hidden="true" className="size-6" />
          </button>
          <p
            data-testid="section-title"
            className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink"
          >
            {sectionTitle}
          </p>
          <UserMenu
            name={userName}
            roleLabel={roleLabel}
            onSignOut={onSignOut}
            {...(profileTo ? { profileTo } : {})}
          />
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
        >
          <Outlet />
        </main>
      </div>

      <Drawer
        side="left"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Activa Club"
        description={roleLabel}
        closeLabel="Cerrar menú"
      >
        <SidebarNav items={items} label={navLabel} onNavigate={() => setMenuOpen(false)} />
        <div className="-mx-5 mt-4">
          <UserBlock name={userName} roleLabel={roleLabel} />
        </div>
      </Drawer>
    </div>
  );
}
