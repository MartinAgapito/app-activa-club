// Utilidad de combinación de clases (sin lógica de negocio).
// Envuelve clsx para componer clases condicionales de forma legible en toda la
// design foundation de Activa Club.

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
