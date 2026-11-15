import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
} from 'obscenity';
import { LOCAL_TERMS, FILTER_LIST_VERSION } from './keyword-filter.terms';

/**
 * Match-chat keyword filter (Sprint 7, F7.3; reused by DMs in Sprint 14).
 *
 * Policy: FLAG, never block or rewrite. The message is delivered as written and a
 * chat_flags row goes to the admin queue (Sprint 12). Keyword lists over-match, and a
 * false block in a live match room breaks the one coordination channel two players
 * have; a false flag costs a moderator a glance. This follows the sprint spec
 * ("overflagged terms → system flag for admin review").
 *
 * Sources, in layers:
 *  1. profanity — the `obscenity` English dataset (MIT): curated terms with a
 *     whitelist for Scunthorpe-style false positives, and transformers that undo
 *     leetspeak, confusable Unicode and stretched letters. Separator-split words
 *     (f.u.c.k) are not caught: stripping punctuation is excluded from the
 *     recommended preset because it multiplies false positives.
 *  2. local — project-owned Nigerian Pidgin / Yoruba / Igbo / Hausa terms in
 *     keyword-filter.terms.ts. Starts empty on purpose: it should be filled from what
 *     moderators actually see in flags and reports, not guessed up front.
 *  3. Platform-risk patterns, which matter more here than swearing:
 *     - off_platform_contact: phone numbers, WhatsApp/Telegram handles and links. The
 *       product exists to replace those groups; moving a match off-platform is where
 *       side bets and post-match harassment happen.
 *     - money_solicitation: naira amounts, bank or wallet names, 10-digit NUBAN account
 *       numbers. Stage 1 is free play, so money talk in a match chat is a side-bet or
 *       scam signal (TA collusion signals; Design copy rules avoid bet/wager framing).
 */

export type FlagCategory = 'profanity' | 'local' | 'off_platform_contact' | 'money_solicitation';

export interface FilterResult {
  flagged: boolean;
  categories: FlagCategory[];
  /** Normalised matched terms (for moderators), deduplicated. */
  terms: string[];
}

export const FILTER_VERSION = `obscenity-0.4.6+local-${FILTER_LIST_VERSION}+risk-1`;

const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const localDataset = new DataSet<{ term: string }>();
for (const term of LOCAL_TERMS) {
  localDataset.addPhrase((phrase) =>
    phrase.setMetadata({ term }).addPattern(parseRawPattern(`|${escapePattern(term)}|`)),
  );
}
const localMatcher =
  LOCAL_TERMS.length > 0
    ? new RegExpMatcher({ ...localDataset.build(), ...englishRecommendedTransformers })
    : null;

/** obscenity patterns treat [ ] ( ) ? | \ specially; local terms are plain words. */
function escapePattern(term: string): string {
  return term.toLowerCase().replace(/[[\]()?|\\]/g, '');
}

// Nigerian mobile numbers: 070/080/081/090/091… local form, or +234 / 234 prefix,
// tolerating spaces, dots and dashes between digit groups.
const PHONE_RE = /(?:\+?234|0)[\s.-]*[789][01](?:[\s.-]*\d){8}\b/;
const CONTACT_RE =
  /\b(?:whats\s*app|watsapp|whatsapp|wa\.me|chat\.whatsapp\.com|telegram|t\.me|tg\s*:|snap(?:chat)?\s*:|insta(?:gram)?\s*:|dm\s+me\s+on)\b/i;

const NAIRA_AMOUNT_RE = /(?:₦|\bn(?:gn)?\s?)\d[\d,.]*k?\b|\b\d[\d,.]*\s?(?:k|naira|ngn)\b/i;
const MONEY_WORDS_RE =
  /\b(?:opay|palmpay|moniepoint|kuda|paystack|flutterwave|acct(?:\s*no)?|account\s*(?:number|no)|bank\s*transfer|send\s+(?:me\s+)?(?:money|cash)|transfer\s+(?:it|the\s+money|to\s+me))\b/i;
const NUBAN_RE = /(?<!\d)\d{10}(?!\d)/;

export function runKeywordFilter(body: string): FilterResult {
  const categories = new Set<FlagCategory>();
  const terms = new Set<string>();

  const profanity = profanityMatcher.getAllMatches(body, true);
  if (profanity.length > 0) {
    categories.add('profanity');
    for (const match of profanity) {
      const word = englishDataset.getPayloadWithPhraseMetadata(match).phraseMetadata?.originalWord;
      if (word) terms.add(word);
    }
  }

  if (localMatcher) {
    for (const match of localMatcher.getAllMatches(body, true)) {
      categories.add('local');
      const term = localDataset.getPayloadWithPhraseMetadata(match).phraseMetadata?.term;
      if (term) terms.add(term);
    }
  }

  const phone = PHONE_RE.exec(body);
  const contact = CONTACT_RE.exec(body);
  if (phone || contact) {
    categories.add('off_platform_contact');
    if (phone) terms.add('phone_number');
    if (contact) terms.add(contact[0].toLowerCase().replace(/\s+/g, ''));
  }

  const amount = NAIRA_AMOUNT_RE.exec(body);
  const moneyWord = MONEY_WORDS_RE.exec(body);
  // A bare 10-digit run is only an account-number signal when it is not a phone number.
  const nuban = !phone && NUBAN_RE.test(body);
  if (amount || moneyWord || nuban) {
    categories.add('money_solicitation');
    if (amount) terms.add('naira_amount');
    if (moneyWord) terms.add(moneyWord[0].toLowerCase().replace(/\s+/g, ' '));
    if (nuban) terms.add('account_number');
  }

  return { flagged: categories.size > 0, categories: [...categories], terms: [...terms] };
}
