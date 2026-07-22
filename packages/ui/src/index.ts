// Punto de entrada de @activa-club/ui.
//
// Design foundation de Activa Club: tokens visuales (ver
// apps/web/docs/design-foundation.md, donde viven como tema de Tailwind) y
// componentes fundamentales reutilizables entre apps. Sin lógica de negocio:
// cada pantalla de Sprint 1+ compone estos bloques con sus propios datos.

export { Button, buttonVariants } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize, ButtonVariantsOptions } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { Card, CardHeader } from './Card';
export type { CardProps, CardHeaderProps } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { PageLayout, PageHeader } from './PageLayout';
export type { PageLayoutProps, PageHeaderProps } from './PageLayout';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { cn } from './cn';
