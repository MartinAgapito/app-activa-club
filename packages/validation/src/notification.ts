// Esquemas de validación de notificaciones (RN-NOT).
// Corresponden a docs/api/contratos-api.md §8.

import { z } from 'zod';

export const notificationSegmentSchema = z.enum([
  'ALL',
  'ACTIVE',
  'DEBT',
  'EXPIRED',
  'EXPIRING_SOON',
  'SINGLE',
  'BY_RESOURCE',
]);

/**
 * Publicación de notificación por el administrador. `SINGLE` exige
 * `targetMemberId`; `BY_RESOURCE` exige `resourceId` (RN-NOT-03).
 */
export const createNotificationSchema = z
  .object({
    segment: notificationSegmentSchema,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(2000),
    alsoEmail: z.boolean(),
    targetMemberId: z.string().optional(),
    resourceId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.segment === 'SINGLE' && !data.targetMemberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El segmento SINGLE requiere targetMemberId.',
        path: ['targetMemberId'],
      });
    }
    if (data.segment === 'BY_RESOURCE' && !data.resourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El segmento BY_RESOURCE requiere resourceId.',
        path: ['resourceId'],
      });
    }
  });
