import { z } from 'zod';
import { commentTextSchema, replyInputSchema } from './comment-threads';
import { destructionMarkSchema } from './destruction/completion';

export const comparisonSchema = z.object({ base: z.string().min(1).max(5000), head: z.string().min(1).max(5000) });
const aim = z.object({ path: z.string().min(1).max(4096), line: z.number().int().positive().optional(), side: z.enum(['additions', 'deletions']).optional(), revision: z.string().optional(), comparison: comparisonSchema.optional() }).refine(a => a.line === undefined ? a.side === undefined : a.side !== undefined, 'Line targets need a side; file targets have neither line nor side.');
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('shoot'), aim, code: z.string(), from: aim.optional(), endLine: z.number().int().positive().optional(), strokeId: z.string().uuid().optional(), mutationId: z.string().uuid().optional() }),
  z.object({ type: z.literal('comment'), aim, comment: commentTextSchema }),
  replyInputSchema.extend({ type: z.literal('reply') }),
  z.object({ type: z.literal('delete-reply'), id: z.string().min(1), replyId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('erase'), aim, from: aim.optional(), endLine: z.number().int().positive().optional(), strokeId: z.string().uuid().optional(), mutationId: z.string().uuid().optional() }),
  z.object({ type: z.enum(['delete', 'resolve', 'reopen']), id: z.string(), resolution: z.string().max(20000).optional() }),
  z.object({ type: z.literal('review-file'), path: z.string(), revision: z.string(), reviewed: z.boolean().optional(), comparison: comparisonSchema.optional() }),
  z.object({ type: z.literal('destroy-file'), path: z.string().min(1).max(4096), revision: z.string().min(1), comparison: comparisonSchema.optional(), mark: destructionMarkSchema }),
  z.object({ type: z.enum(['finish', 'undo', 'redo', 'save', 'discard']) })
]);
