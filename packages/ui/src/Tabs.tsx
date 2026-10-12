// Pestañas de la design foundation de Activa Club (US-064).
// Construido sobre las primitivas accesibles de Radix UI (ADR-0013, en
// US-062), que implementan el patrón WAI-ARIA de pestañas: roles
// tablist/tab/tabpanel, aria-selected/aria-controls/aria-labelledby, flechas,
// Inicio/Fin y tabindex móvil. Este archivo solo aporta estilos con los
// tokens. Sin lógica de negocio, sin llamadas a API y sin acoplarse a la
// librería de rutas: el llamador decide dónde guarda la pestaña activa.
//
// Uso no controlado:
//   <Tabs defaultValue="proximas"> ... </Tabs>
//
// Uso controlado (p. ej. pestaña en la URL con react-router-dom):
//   const [params, setParams] = useSearchParams();
//   const tab = params.get('tab') ?? 'proximas';
//   <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Badge } from './Badge';
import { cn } from './cn';

export type TabsProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;

/** Contenedor. Props relevantes: `value` + `onValueChange` (controlado) o
 * `defaultValue` (no controlado). */
export const Tabs = forwardRef<ElementRef<typeof TabsPrimitive.Root>, TabsProps>(function Tabs(
  { className, ...props },
  ref,
) {
  return <TabsPrimitive.Root ref={ref} className={cn('min-w-0', className)} {...props} />;
});

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

/** Fila de pestañas. Si no caben, se desplaza horizontalmente dentro de su
 * propia fila sin desbordar la página. Requiere `aria-label` o
 * `aria-labelledby` para dar nombre accesible al grupo. */
export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  function TabsList({ className, ...props }, ref) {
    return (
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          'flex max-w-full overflow-x-auto overscroll-x-contain border-b border-line',
          className,
        )}
        {...props}
      />
    );
  },
);

export interface TabsTriggerProps extends Omit<
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
  'children'
> {
  /** Etiqueta de la pestaña. */
  children: ReactNode;
  /** Contador opcional (p. ej. pendientes). Se muestra como badge. */
  count?: number;
}

/** Pestaña individual. `disabled` la excluye de la navegación con teclado. */
export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  function TabsTrigger({ className, children, count, ...props }, ref) {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent',
          '-mb-px px-4 text-sm font-medium text-ink-muted',
          'transition-colors duration-(--motion-fast) ease-(--motion-ease)',
          'hover:bg-surface-brand-soft hover:text-action',
          'data-[state=active]:border-action data-[state=active]:font-semibold data-[state=active]:text-action',
          // El contorno va hacia adentro para que el contenedor con scroll no lo recorte.
          'focus-ring focus-visible:-outline-offset-2 state-disabled',
          'disabled:hover:bg-transparent disabled:hover:text-ink-muted',
          className,
        )}
        {...props}
      >
        {children}
        {count !== undefined ? (
          <Badge variant="info" className="px-2 py-0.5">
            {count}
          </Badge>
        ) : null}
      </TabsPrimitive.Trigger>
    );
  },
);

export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

/** Panel. Solo el de la pestaña activa se muestra. */
export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, TabsContentProps>(
  function TabsContent({ className, ...props }, ref) {
    return (
      <TabsPrimitive.Content
        ref={ref}
        className={cn('pt-4 focus-ring focus-visible:-outline-offset-2', className)}
        {...props}
      />
    );
  },
);
