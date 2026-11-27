import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { schema } from '../db/client';
import type { Tx } from '../db/tx';

/**
 * Posts a system message into the match chat inside the caller's transaction (Sprint 8:
 * "a dispute has been opened"). Creates the conversation and its participants if the
 * relay has not done so yet. Live delivery happens through the match-state broadcast
 * that the same transaction's outbox event triggers: clients re-read the chat on every
 * state change.
 */
export async function postSystemMessage(tx: Tx, matchId: string, body: string): Promise<void> {
  await tx
    .insert(schema.conversations)
    .values({ id: uuidv7(), scope: 'match', matchId })
    .onConflictDoNothing({ target: schema.conversations.matchId });
  const [conversation] = await tx
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.matchId, matchId))
    .limit(1);
  if (!conversation) throw new Error(`conversation for match ${matchId} missing after upsert`);

  const sides = await tx
    .select({ userId: schema.matchSides.userId })
    .from(schema.matchSides)
    .where(eq(schema.matchSides.matchId, matchId));
  if (sides.length > 0) {
    await tx
      .insert(schema.conversationParticipants)
      .values(sides.map((s) => ({ conversationId: conversation.id, userId: s.userId })))
      .onConflictDoNothing();
  }

  await tx.insert(schema.messages).values({
    id: uuidv7(),
    conversationId: conversation.id,
    senderId: null,
    kind: 'system',
    body,
  });
}
