import { z } from 'zod';
import type { CommentRole, Finding } from '$lib/types';

export const commentTextSchema = z.string().trim().min(1, 'Write a comment first.').max(20000);
export const replyInputSchema = z.object({ id: z.string().min(1), comment: commentTextSchema }).strict();
export const agentFeedbackSchema = z.object({
  reviewId: z.string().min(1),
  reviewGeneration: z.string().datetime().optional(),
  feedbackId: z.string().min(1).max(200).optional(),
  resolutions: z.array(z.object({ id: z.string().min(1), note: z.string().max(20000).optional() }).strict()).max(1000).default([]),
  replies: z.array(replyInputSchema).max(1000).default([])
}).strict().refine(value => value.resolutions.length + value.replies.length > 0, 'Provide replies or resolutions.');
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;

export function appendReply(finding: Finding | undefined, comment: string, role: CommentRole, id: string, createdAt: string): Finding {
  if (!finding) throw new Error('Comment no longer exists.');
  if (finding.code || finding.comment === undefined) throw new Error('Only comments support replies.');
  const reply = { id, role, comment: commentTextSchema.parse(comment), createdAt };
  return { ...finding, replies: [...(finding.replies || []), reply] };
}

export function removeReply(finding: Finding | undefined, replyId: string): Finding {
  if (!finding) throw new Error('Comment no longer exists.');
  if (finding.code || finding.comment === undefined) throw new Error('Only comments support replies.');
  const reply = finding.replies?.find(reply => reply.id === replyId);
  if (!reply) throw new Error('Reply no longer exists.');
  const replies = finding.replies!.filter(reply => reply.id !== replyId);
  // Agent resolution notes are also stored as reply text. Do not show a
  // deleted note again through the thread's fallback resolution display.
  const resolution = finding.resolution === reply.comment && !replies.some(reply => reply.comment === finding.resolution)
    ? undefined : finding.resolution;
  return { ...finding, replies, resolution };
}
