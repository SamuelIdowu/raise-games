/**
 * Legal and policy pages (audit B8). Community rules restate platform rules the owner has
 * already decided (PRD "Rules", decisions 0004 and 0005). Terms and Privacy are drafts:
 * the Privacy draft states only what the product actually does with data, as input for
 * legal review; clauses only legal can write are marked as placeholders. When legal
 * supplies final text, replace the sections, set `draft: false`, and bump the consent
 * version (`apps/api/src/consent/consent.constants.ts`) so every player re-accepts.
 */
export interface LegalDoc {
  title: string;
  /** Shown as "Version …" and matched to the consent version where applicable. */
  version: string;
  /** Drafts show a banner and must not be relied on. */
  draft: boolean;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

const PENDING = '[To be provided by legal counsel.]';

export const COMMUNITY_RULES: LegalDoc = {
  title: 'Community rules',
  version: '1.0',
  draft: false,
  intro:
    'RAISE works because results are honest and players show up. These rules apply to every match, chat and profile.',
  sections: [
    {
      heading: 'Play fair',
      paragraphs: [
        'Submit the real result with a real screenshot of that match. Reusing a screenshot from another match is detected and counts against your account.',
        'Do not arrange results with your opponent. Repeat matches against the same opponent within 7 days earn less rating from the 4th match on, and nothing from the 6th.',
        'Use only your own account. One player, one account.',
      ],
    },
    {
      heading: 'Show up and finish',
      paragraphs: [
        'An open challenge expires after 48 hours if nobody accepts it.',
        'After the agreed start, submit your result within 24 hours. Your opponent then has 24 hours to confirm or dispute it. If they do neither, your result is confirmed automatically.',
        'If your opponent does not show up, you can report a no-show 20 minutes after the agreed start, with a screenshot showing you were there.',
        'Cancelling after a challenge is accepted, and no-shows, lower your reputation.',
      ],
    },
    {
      heading: 'Disputes',
      paragraphs: [
        'If you disagree with a result, open a dispute with your reason and evidence. A moderator reviews both submissions and the match chat, records a ruling with a reason, and both players see it.',
        'You can appeal a ruling once. A void ruling is final.',
        'Opening disputes you lose, again and again, counts against your account.',
      ],
    },
    {
      heading: 'Chat and messages',
      paragraphs: [
        'Be respectful. No harassment, threats or hate.',
        'Keep games on RAISE: do not share phone numbers or move money arrangements off the platform. Messages are checked automatically for abusive language, contact details and payment requests.',
        'Moderators may read a match chat when reviewing a dispute, a report, or suspected cheating. Every such review is logged. A match chat closes to new messages 72 hours after the match ends.',
        'You can block or report any player from a message or their profile.',
      ],
    },
    {
      heading: 'What happens when rules are broken',
      paragraphs: [
        'Moderators apply sanctions one step at a time: a warning, then a 7-day suspension, then a 30-day suspension, then a permanent ban. During a suspension you can still sign in and finish matches already under way, but you cannot create or accept challenges. A year without sanctions resets the ladder.',
        'Some patterns pause new challenges automatically while a moderator reviews your account: in 30 days, 2 reused screenshots, 3 upheld reports against you, 3 disputes you opened and lost, or 3 late cancels and no-shows. This pause is not a sanction, and a moderator can lift it.',
        'If you think a sanction is wrong, contact support. Mistakes are reversed and removed from your record.',
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy policy',
  version: '1.0',
  draft: true,
  intro:
    'Draft for legal review. It describes what RAISE does with your data today; the final policy will come from legal counsel and may change.',
  sections: [
    {
      heading: 'What we collect',
      paragraphs: [
        'Your phone number, to sign you in with a one-time code. Your username, the games you play, your in-game IDs, and optionally your city or campus.',
        'Optionally, an email address for notifications. We only email it after you confirm it from the link we send.',
        'Your challenges, matches, results, the screenshots you upload as proof, disputes, and the messages you send in match chats (and direct messages, if that feature is on).',
        'Your state of residence, recorded for features that differ by state.',
        'Device, network address and app activity, used to keep accounts secure and to detect cheating, such as duplicate accounts and reused screenshots.',
        'Which version of these terms and this policy you accepted, and when.',
      ],
    },
    {
      heading: 'How we use it',
      paragraphs: [
        'To run matches, ratings and leaderboards; leaderboards show usernames only.',
        'To send the notifications you choose, in the app, by push or by email.',
        'To resolve disputes and reports: moderators may read the match chat and see both players’ submissions. Every staff review is logged.',
        'To detect fraud and abuse, and to keep the service reliable. Errors and usage are measured with your phone number, email and tokens removed.',
      ],
    },
    {
      heading: 'Who can see it',
      paragraphs: [
        'Other players see your username, ratings, record, reputation, in-game IDs and, if you set them, your city or campus. They never see your phone number or email.',
        'RAISE moderators and administrators, under the rules above. Service providers we use to run RAISE (hosting, SMS, email, storage, error tracking) process data on our behalf. ' +
          PENDING,
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'In Settings you can download a copy of your data and delete your account. Deleting removes your phone number, username, email and in-game IDs and signs you out everywhere. Past matches stay, shown as a deleted player, so your opponents’ records stay correct.',
        `Further rights under the Nigeria Data Protection Act 2023, and how to complain. ${PENDING}`,
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [`Retention periods for screenshots, chat and accounts. ${PENDING}`],
    },
    {
      heading: 'Contact',
      paragraphs: [`Data controller and contact details. ${PENDING}`],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: 'Terms of service',
  version: '1.0',
  draft: true,
  intro:
    'Draft for legal review. The final terms will come from legal counsel. The community rules are part of these terms.',
  sections: [
    {
      heading: 'The service',
      paragraphs: [
        'RAISE lets players find opponents, play matches in games they own, submit results and climb ratings. During Stage 1 every challenge is free: no money is staked, paid or won.',
      ],
    },
    {
      heading: 'Your account',
      paragraphs: [
        'You sign in with your own phone number and keep one account. You are responsible for what happens on it.',
        `Minimum age and eligibility. ${PENDING}`,
      ],
    },
    {
      heading: 'Rules of play',
      paragraphs: [
        'You agree to the community rules, including how results are verified, how disputes are decided and how sanctions work.',
      ],
    },
    {
      heading: 'Match chat',
      paragraphs: [
        'Each match has a chat between the two players. Messages are stored by RAISE. Moderators and administrators may read a match chat when reviewing a dispute, a report, or suspected cheating or abuse, and may use it as evidence. Each review is logged. Messages are checked automatically for abusive language, contact details and payment requests. A match chat closes to new messages 72 hours after the match ends and is kept for dispute review.',
      ],
    },
    {
      heading: 'Games and trademarks',
      paragraphs: [
        'Game names belong to their publishers. RAISE is not affiliated with or endorsed by them.',
      ],
    },
    {
      heading: 'Liability, changes and law',
      paragraphs: [
        `Limitation of liability, changes to the terms, termination and governing law. ${PENDING}`,
      ],
    },
  ],
};
