/**
 * Project-owned local-language terms for the chat keyword filter (Nigerian Pidgin,
 * Yoruba, Igbo, Hausa). Matched as whole words after obscenity's leetspeak/confusable
 * normalisation, and FLAG only (see keyword-filter.ts).
 *
 * Deliberately empty at launch. Many common local insults are mild, everyday banter
 * between friends; guessing a list would flood the admin queue with false flags. Grow
 * it from evidence instead:
 *   1. Moderators review chat_flags and message_reports (Sprint 12 queue).
 *   2. Terms that recur in genuinely abusive reports are added here with a note.
 *   3. Bump FILTER_LIST_VERSION; every chat_flags row records the version that made it.
 * Owner: trust & safety. Review cadence: monthly, or after any harassment incident.
 */
export const LOCAL_TERMS: readonly string[] = [];

export const FILTER_LIST_VERSION = '2026-11-14';
