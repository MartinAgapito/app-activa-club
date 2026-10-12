// Definición de la navegación autenticada por rol (US-068). Solo datos: las
// rutas son las del mapa de rutas (docs/mapa-de-rutas.md) y no cambian aquí.

import {
  Bell,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  CreditCard,
  Dumbbell,
  House,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** `id` del `<main>` autenticado/público: destino de "Saltar al contenido". */
export const MAIN_CONTENT_ID = 'contenido-principal';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Solo activo con coincidencia exacta de la ruta (p. ej. el inicio). */
  end?: boolean;
  /** Contador opcional (p. ej. pendientes). Preparado; sin datos por ahora. */
  badge?: number;
}

export const MEMBER_NAV: NavItem[] = [
  { to: '/socio', label: 'Inicio', icon: House, end: true },
  { to: '/socio/reservas', label: 'Reservar', icon: CalendarPlus, end: true },
  { to: '/socio/reservas/mias', label: 'Mis reservas', icon: CalendarCheck },
  { to: '/socio/membresia', label: 'Membresía', icon: BadgeCheck },
  { to: '/socio/pagos', label: 'Pagos', icon: CreditCard },
  { to: '/socio/notificaciones', label: 'Notificaciones', icon: Bell },
  { to: '/socio/perfil', label: 'Perfil', icon: UserRound },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Inicio', icon: House, end: true },
  { to: '/admin/solicitudes', label: 'Solicitudes de socios', icon: UserCheck },
  { to: '/admin/reservas', label: 'Reservas', icon: CalendarDays },
  { to: '/admin/recursos', label: 'Recursos', icon: Dumbbell },
  { to: '/admin/socios', label: 'Socios', icon: Users },
  { to: '/admin/membresias', label: 'Pagos', icon: Wallet },
  { to: '/admin/notificaciones', label: 'Notificaciones', icon: Bell },
  { to: '/admin/analytics', label: 'Analítica', icon: ChartColumn },
];
