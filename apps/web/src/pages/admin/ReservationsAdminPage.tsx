import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ReservationsAdminPage() {
  return (
    <UnderConstructionPage
      title="Reservas y aprobaciones"
      description="Consulta de reservas y aprobación/rechazo de parrillas y salón social (RN-RES-02, RN-ADM-05)."
      endpoints={[
        'GET /reservations?scope=all',
        'POST /reservations/{reservationId}/approve',
        'POST /reservations/{reservationId}/reject',
      ]}
    />
  );
}
