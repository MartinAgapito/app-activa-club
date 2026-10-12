// Indicador de pasos (stepper) de la design foundation de Activa Club.
// Presenta una secuencia corta y predecible (p. ej. el asistente de reserva).
// Es puramente visual: no conoce reglas de negocio ni llama a la API; el
// llamador decide qué paso es el actual y si volver atrás está permitido.
//
// - Semántica: lista ordenada (<ol>) con aria-current="step" en el actual.
// - El estado nunca depende solo del color: marca de verificado o número,
//   más texto accesible ("completado", "paso actual", "pendiente").
// - En < 640 px se muestra la forma compacta "Paso 2 de 4: Día y franja".

import type { ReactNode } from 'react';
import { cn } from './cn';

export interface StepperStep {
  /** Etiqueta visible del paso. */
  label: string;
  /** Identificador estable opcional (se usa como key; por defecto, la etiqueta). */
  id?: string;
}

export type StepperStepState = 'completed' | 'current' | 'pending';

export interface StepperProps {
  steps: readonly StepperStep[];
  /** Índice (base 0) del paso actual. Los anteriores se consideran completados. */
  currentStep: number;
  /** Si se provee, los pasos completados se vuelven clicables (volver atrás).
   * Los pasos actual y pendientes nunca son clicables. Recibe el índice. */
  onStepClick?: (index: number) => void;
  /** Nombre accesible de la navegación. */
  'aria-label'?: string;
  className?: string;
}

const stateText: Record<StepperStepState, string> = {
  completed: 'completado',
  current: 'paso actual',
  pending: 'pendiente',
};

const markerClasses: Record<StepperStepState, string> = {
  completed:
    'bg-status-confirmed-soft text-status-confirmed ring-1 ring-inset ring-status-confirmed',
  current: 'bg-action text-ink-on-brand',
  pending: 'bg-surface-card text-ink-muted ring-1 ring-inset ring-line',
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  'aria-label': ariaLabel = 'Progreso',
  className,
}: StepperProps) {
  const total = steps.length;
  if (total === 0) return null;

  const current = Math.min(Math.max(Math.trunc(currentStep) || 0, 0), total - 1);
  const currentLabel = steps[current]?.label ?? '';

  return (
    <nav aria-label={ariaLabel} className={cn('w-full', className)}>
      {/* Forma compacta (< 640 px). */}
      <p className="type-aux font-semibold text-ink sm:hidden">
        Paso {current + 1} de {total}: {currentLabel}
      </p>

      {/* Forma completa (>= 640 px). */}
      <ol className="hidden items-start gap-2 sm:flex">
        {steps.map((step, index) => {
          const state: StepperStepState =
            index < current ? 'completed' : index === current ? 'current' : 'pending';
          const isClickable = state === 'completed' && onStepClick !== undefined;
          const isLast = index === total - 1;

          const content: ReactNode = (
            <>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  markerClasses[state],
                )}
                aria-hidden="true"
              >
                {state === 'completed' ? <CheckIcon /> : index + 1}
              </span>
              <span
                className={cn(
                  'type-aux min-w-0 break-words text-left',
                  state === 'current' ? 'font-semibold text-ink' : 'text-ink-muted',
                )}
              >
                {step.label}
                <span className="sr-only">: {stateText[state]}</span>
              </span>
            </>
          );

          return (
            <li
              key={step.id ?? step.label}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex min-w-0 items-start gap-2', !isLast && 'flex-1')}
            >
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(index)}
                  className="focus-ring -m-1 flex items-start gap-2 rounded-control p-1 text-left hover:bg-surface-brand-soft"
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-start gap-2">{content}</span>
              )}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-4 h-0.5 min-w-4 flex-1',
                    state === 'completed' ? 'bg-status-confirmed' : 'bg-line',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
