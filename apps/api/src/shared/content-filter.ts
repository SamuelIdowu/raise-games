/**
 * Baseline keyword filter for short user text (result notes now; Sprint 7 chat
 * reuses it). Deliberately small: overflagging is worse than a miss here because
 * moderators review disputes anyway. Matching is on word boundaries after
 * normalising common character swaps.
 */
const BLOCKLIST = [
  'fuck',
  'fucker',
  'motherfucker',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  // Nigerian Pidgin / Yoruba insults commonly used at opponents
  'mumu',
  'oloshi',
  'werey',
  'ashawo',
];

const SWAPS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '@': 'a',
  $: 's',
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[01345@$]/g, (c) => SWAPS[c] ?? c);
}

const PATTERN = new RegExp(`\\b(${BLOCKLIST.join('|')})\\b`, 'i');

export function containsBlockedTerm(text: string): boolean {
  return PATTERN.test(normalise(text));
}
