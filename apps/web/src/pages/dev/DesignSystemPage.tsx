// Página de referencia interna, solo disponible en modo desarrollo
// (import.meta.env.DEV). No forma parte del mapa de rutas del MVP — ver
// apps/web/docs/mapa-de-rutas.md, sección "Herramientas internas de desarrollo".

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Stepper,
  type BadgeVariant,
} from '@activa-club/ui';
import { ReferenceForm } from '../../examples/ReferenceForm';
import { ReferenceQueryDemo } from '../../examples/ReferenceQueryDemo';
import { TokensShowcase } from './TokensShowcase';

const BADGE_VARIANTS: BadgeVariant[] = ['neutral', 'info', 'positive', 'warning', 'danger'];

const STEPPER_DEMO_STEPS = [
  { label: 'Instalación' },
  { label: 'Día y franja' },
  { label: 'Participantes' },
  { label: 'Confirmar' },
];

function StepperDemo() {
  const [step, setStep] = useState(2);
  return (
    <div className="flex flex-col gap-4">
      <Stepper steps={STEPPER_DEMO_STEPS} currentStep={step} onStepClick={setStep} />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          disabled={step === STEPPER_DEMO_STEPS.length - 1}
          onClick={() => setStep((s) => s + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Design system (referencia interna)"
        description="Vista de desarrollo para validar tokens y componentes de @activa-club/ui. No es una pantalla de negocio."
      />

      <TokensShowcase />

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

      <Card>
        <CardHeader title="Stepper (indicador de pasos)" />
        <StepperDemo />
      </Card>

      <ReferenceForm />
      <ReferenceQueryDemo />
    </div>
  );
}
