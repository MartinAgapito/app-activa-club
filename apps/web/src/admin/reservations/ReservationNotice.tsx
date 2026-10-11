// Aviso de resultado de una acción administrativa sobre una reserva
// (éxito o error), con `role` adecuado para lectores de pantalla.

import { cn } from '@activa-club/ui';

export interface ReservationNoticeData {
  type: 'success' | 'error';
  title: string;
  message: string;
}

export function ReservationNotice({ notice }: { notice: ReservationNoticeData }) {
  return (
    <div
      role={notice.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-1 rounded-xl border p-4 text-sm',
        notice.type === 'success'
          ? 'border-positive-200 bg-positive-50 text-positive-900'
          : 'border-danger-200 bg-danger-50 text-danger-800',
      )}
    >
      <p className="font-semibold">{notice.title}</p>
      <p>{notice.message}</p>
    </div>
  );
}
