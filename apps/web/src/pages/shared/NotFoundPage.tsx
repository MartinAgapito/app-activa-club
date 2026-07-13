import { Link } from 'react-router-dom';
import { EmptyState, buttonVariants } from '@activa-club/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <EmptyState
        title="Página no encontrada"
        description="La dirección a la que intentas acceder no existe o fue movida."
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            Volver al inicio
          </Link>
        }
      />
    </div>
  );
}
