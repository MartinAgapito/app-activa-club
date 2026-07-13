// Mapa de rutas de Activa Club (US-008).
// Documentación funcional completa: apps/web/docs/mapa-de-rutas.md.
// Ningún componente de este árbol implementa lógica de negocio: las páginas
// de Sprint 1+ reemplazarán a `UnderConstructionPage` dentro de la misma ruta.

import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RequireRole } from './guards/RequireRole';

import { PublicLayout } from '../layouts/PublicLayout';
import { MemberLayout } from '../layouts/MemberLayout';
import { AdminLayout } from '../layouts/AdminLayout';

import { HomePage } from '../pages/public/HomePage';
import { LoginPage } from '../pages/public/LoginPage';
import { ActivationPage } from '../pages/public/ActivationPage';
import { RegisterPage } from '../pages/public/RegisterPage';
import { ForgotPasswordPage } from '../pages/public/ForgotPasswordPage';
import { VerifyEmailPage } from '../pages/public/VerifyEmailPage';

import { MemberDashboardPage } from '../pages/member/MemberDashboardPage';
import { MembershipPage } from '../pages/member/MembershipPage';
import { PaymentsPage } from '../pages/member/PaymentsPage';
import { ReservationsPage } from '../pages/member/ReservationsPage';
import { NotificationsPage } from '../pages/member/NotificationsPage';
import { ProfilePage } from '../pages/member/ProfilePage';

import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { MembersManagementPage } from '../pages/admin/MembersManagementPage';
import { PendingRequestsPage } from '../pages/admin/PendingRequestsPage';
import { MembershipsAdminPage } from '../pages/admin/MembershipsAdminPage';
import { ReservationsAdminPage } from '../pages/admin/ReservationsAdminPage';
import { ResourcesMaintenancePage } from '../pages/admin/ResourcesMaintenancePage';
import { NotificationsAdminPage } from '../pages/admin/NotificationsAdminPage';
import { AnalyticsPage } from '../pages/admin/AnalyticsPage';

import { PendingApprovalPage } from '../pages/shared/PendingApprovalPage';
import { ForbiddenPage } from '../pages/shared/ForbiddenPage';
import { NotFoundPage } from '../pages/shared/NotFoundPage';
import { DesignSystemPage } from '../pages/dev/DesignSystemPage';

const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/activar-cuenta', element: <ActivationPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/recuperar-password', element: <ForgotPasswordPage /> },
      { path: '/verificar-correo', element: <VerifyEmailPage /> },
    ],
  },
  {
    // Estado transicional: sesión de socio válida pero memberStatus distinto
    // de ACTIVE (RN-ACT-06/07). Ver docs/mapa-de-rutas.md.
    element: <RequireRole allow={['member']} />,
    children: [{ path: '/cuenta/pendiente-aprobacion', element: <PendingApprovalPage /> }],
  },
  {
    element: <RequireRole allow={['member']} />,
    children: [
      {
        element: <MemberLayout />,
        children: [
          { path: '/socio', element: <MemberDashboardPage /> },
          { path: '/socio/membresia', element: <MembershipPage /> },
          { path: '/socio/pagos', element: <PaymentsPage /> },
          { path: '/socio/reservas', element: <ReservationsPage /> },
          { path: '/socio/notificaciones', element: <NotificationsPage /> },
          { path: '/socio/perfil', element: <ProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole allow={['admin']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin', element: <AdminDashboardPage /> },
          { path: '/admin/socios', element: <MembersManagementPage /> },
          { path: '/admin/solicitudes', element: <PendingRequestsPage /> },
          { path: '/admin/membresias', element: <MembershipsAdminPage /> },
          { path: '/admin/reservas', element: <ReservationsAdminPage /> },
          { path: '/admin/recursos', element: <ResourcesMaintenancePage /> },
          { path: '/admin/notificaciones', element: <NotificationsAdminPage /> },
          { path: '/admin/analytics', element: <AnalyticsPage /> },
        ],
      },
    ],
  },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
];

// Herramientas internas de desarrollo (fuera del mapa de rutas del MVP): el
// chequeo de `import.meta.env.DEV` es una constante estática de Vite, por lo
// que esta ruta se elimina del bundle de producción por tree-shaking (ver
// docs/mapa-de-rutas.md, sección "Herramientas internas de desarrollo").
if (import.meta.env.DEV) {
  routes.unshift({ path: '/_dev/design-system', element: <DesignSystemPage /> });
}

export const router = createBrowserRouter(routes);
