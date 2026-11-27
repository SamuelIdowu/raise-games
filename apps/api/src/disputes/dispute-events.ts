import { z } from 'zod';
import { RULING_OUTCOMES } from './disputes.rules';

/**
 * `dispute.ruled` outbox contract (Sprint 9, F9.3). Defined now so Sprint 10 (ratings) and
 * Sprint 13 (ledger holds) can consume it without changes. Consumers dedupe on
 * (disputeId, round). A contract test pins this shape.
 */
export const disputeRuledEventSchema = z.object({
  disputeId: z.uuid(),
  matchId: z.uuid(),
  gameId: z.uuid(),
  /** 1 = first ruling, 2 = ruling on the appeal. */
  round: z.union([z.literal(1), z.literal(2)]),
  outcome: z.enum(RULING_OUTCOMES),
  previousOutcome: z.enum(RULING_OUTCOMES).nullable(),
  winnerUserId: z.uuid().nullable(),
  loserUserId: z.uuid().nullable(),
  draw: z.boolean(),
  void: z.boolean(),
  participants: z.array(z.uuid()).length(2),
  /** What ratings/holds must do (see ratingActionFor). */
  ratingAction: z.enum(['apply', 'reverse_and_apply', 'reverse', 'none']),
  final: z.boolean(),
  ruledAt: z.iso.datetime(),
  /** Open → ruling, for the "median resolution < 24h" success metric. */
  resolutionMs: z.number().int().nonnegative(),
});
export type DisputeRuledEvent = z.infer<typeof disputeRuledEventSchema>;
