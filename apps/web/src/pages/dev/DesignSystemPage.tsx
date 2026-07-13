// Página de referencia interna, solo disponible en modo desarrollo
// (import.meta.env.DEV). No forma parte del mapa de rutas del MVP — ver
// apps/web/docs/mapa-de-rutas.md, sección "Herramientas internas de desarrollo".

import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  type BadgeVariant,
} from '@activa-club/ui';
import { ReferenceForm } from '../../examples/ReferenceForm';
import { ReferenceQueryDemo } from '../../examples/ReferenceQueryDemo';

const BADGE_VARIANTS: BadgeVariant[] = ['neutral', 'info', 'positive', 'warning', 'danger'];

export function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Design system (referencia interna)"
        description="Vista de desarrollo para validar tokens y componentes de @activa-club/ui. No es una pantalla de negocio."
      />

      <Card>
        <CardHeader title="Botones" />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="positive">Positivo</Button>
          <Button variant="warning">Alerta</Button>
          <Button variant="danger">Destructivo</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" isLoading>
            Cargando
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Badges de estado" />
        <div className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Input" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Correo electrónico" placeholder="socio@correo.com" />
          <Input label="DNI" errorMessage="El DNI debe tener 8 dígitos." defaultValue="1234" />
        </div>
      </Card>

      <ReferenceForm />
      <ReferenceQueryDemo />
    </div>
  );
}
