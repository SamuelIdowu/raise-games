'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@raise/api-client';
import {
  Accordion,
  ButtonLink,
  Eyebrow,
  Icon,
  PixelCube,
  PixelIcon,
  PromoBanner,
  StatCard,
  type PixelIconName,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const GAMES = ['eFootball', 'Call of Duty: Mobile', 'PUBG Mobile'];

const STEPS: Array<{ title: string; body: string; icon: PixelIconName }> = [
  {
    title: 'Create your account',
    body: 'Sign up with your phone number. No fees and no wallet. Add the game IDs you play under so opponents can find you.',
    icon: 'heart',
  },
  {
    title: 'Pick a challenge',
    body: 'Browse open challenges by game and format, or post your own. Invite a friend directly or open it to the whole board.',
    icon: 'gamepad',
  },
  {
    title: 'Play your match',
    body: 'Meet in game, play it out, then both players report the result. A screenshot is your proof.',
    icon: 'flame',
  },
  {
    title: 'Climb the ladder',
    body: 'Confirmed results update your rating and reputation. Disputes go to real moderators who review the proof.',
    icon: 'crown',
  },
];

const GAME_CARDS: Array<{
  name: string;
  body: string;
  format: string;
  proof: string;
  icon: PixelIconName;
}> = [
  {
    name: 'eFootball',
    body: 'Friend match, one game, full time. Settle who really runs the pitch.',
    format: '1v1 duel',
    proof: 'Final score screen',
    icon: 'gamepad',
  },
  {
    name: 'Call of Duty: Mobile',
    body: 'Private multiplayer room, agreed map and mode. First to the score limit takes it.',
    format: '1v1 duel',
    proof: 'Scoreboard screenshot',
    icon: 'bolt',
  },
  {
    name: 'PUBG Mobile',
    body: 'Custom room team deathmatch, one on one. Rules are agreed before the room opens.',
    format: '1v1 TDM duel',
    proof: 'Results screen',
    icon: 'flame',
  },
];

const FAQ = [
  {
    question: 'What is RAISE?',
    answer:
      'A place to find 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile, play them, and get a verified, ranked result.',
  },
  {
    question: 'Does it cost anything?',
    answer: 'No. Challenges are free to play right now. There are no deposits and no withdrawals.',
  },
  {
    question: 'How is a result confirmed?',
    answer:
      'Both players report the result. If the reports match, it is confirmed. If they do not, either player can open a dispute and a moderator reviews the proof.',
  },
  {
    question: 'How does my rating work?',
    answer:
      'Each game has its own ladder. Your rating moves after every confirmed result, and it is marked provisional until you have played enough rated matches.',
  },
  {
    question: 'Is it safe to play?',
    answer:
      'Proof is kept on every match, reputation shows who reports honestly, and you can block or report any player.',
  },
] as const;

/** Floating pixel blocks in the hero corners (the reference's cubes). */
const FLOATERS: Array<{
  icon: PixelIconName;
  tile: string;
  className: string;
  rot: string;
  delay: string;
}> = [
  {
    icon: 'heart',
    tile: 'bg-accent text-white',
    className: 'left-[6%] top-[8%]',
    rot: '-16deg',
    delay: '0s',
  },
  {
    icon: 'star',
    tile: 'bg-brand text-white',
    className: 'left-[16%] top-[52%]',
    rot: '12deg',
    delay: '-2s',
  },
  {
    icon: 'shield',
    tile: 'bg-cream text-accent',
    className: 'right-[14%] top-[44%]',
    rot: '-10deg',
    delay: '-4s',
  },
  {
    icon: 'bolt',
    tile: 'bg-cream text-brand',
    className: 'right-[5%] top-[4%]',
    rot: '18deg',
    delay: '-1s',
  },
];

function Floater({ icon, tile, className, rot, delay }: (typeof FLOATERS)[number]) {
  return (
    <span
      aria-hidden
      className={cn('animate-float absolute hidden md:block', className)}
      style={{ ['--float-rot' as string]: rot, animationDelay: delay }}
    >
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-md shadow-hard [--hard-ink:var(--shadow-ink)]',
          tile,
        )}
      >
        <PixelIcon name={icon} size={30} className="[--hard-ink:var(--shadow-ink)]" />
      </span>
    </span>
  );
}

/** The slanted barcode stripe + "001" counter above each step (§7.8). */
function StepHeader({ index, icon }: { index: number; icon: PixelIconName }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex gap-[3px]">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-1.5 -skew-x-[20deg]',
              i < (index + 1) * 2 ? 'bg-accent' : 'bg-line-strong',
            )}
          />
        ))}
      </span>
      <span className="font-display text-[12px] font-bold italic text-accent tabular">
        {String(index + 1).padStart(3, '0')}
      </span>
      <PixelIcon name={icon} size={18} className="text-accent [--hard-ink:var(--accent-ink)]" />
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  // Signed-in players land on their dashboard. Tokens live in localStorage, so this
  // can only run on the client.
  useEffect(() => {
    if (isAuthenticated()) router.replace('/home');
  }, [router]);

  return (
    <div className="-mt-8 lg:-mt-16">
      {/* Hero */}
      <section className="pixel-field relative -mx-4 overflow-hidden px-4 pb-12 pt-16 lg:-mx-12 lg:pt-24">
        {FLOATERS.map((floater) => (
          <Floater key={floater.icon} {...floater} />
        ))}
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center text-center">
          <Eyebrow>Free 1v1 challenges</Eyebrow>
          <h1 className="mt-5 font-display text-mk-display-xl uppercase text-fg">
            Challenge
            <br />
            any player
          </h1>
          <p className="mt-5 max-w-[380px] text-[13px] font-medium leading-relaxed text-fg">
            Free 1v1 challenges in eFootball, Call of Duty: Mobile and PUBG Mobile. Play, report,
            and every result is settled with proof.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/onboarding/phone" arrow>
              Start playing now!
            </ButtonLink>
            <ButtonLink href="/leaderboard" variant="secondary" arrow>
              View leaderboard
            </ButtonLink>
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-[10px] text-fg-disabled">
            <Icon name="shield" size={12} /> Free to play. No deposits, no wallet.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1120px]">
        {/* Supported games marquee */}
        <section aria-label="Supported games" className="relative overflow-hidden py-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
          <div className="animate-marquee flex w-max items-center gap-12">
            {[...GAMES, ...GAMES, ...GAMES, ...GAMES].map((game, i) => (
              <span
                key={`${game}-${i}`}
                aria-hidden={i >= GAMES.length}
                className="shrink-0 font-display text-[15px] font-black uppercase tracking-[-0.01em] text-fg-subtle opacity-70 transition hover:text-fg hover:opacity-100"
              >
                {game}
              </span>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section
          aria-label="RAISE at a glance"
          className="grid grid-cols-1 gap-5 py-10 sm:grid-cols-3"
        >
          <StatCard label="Games" value={3} icon="gamepad" />
          <StatCard label="Entry fee" value="₦0" icon="star" />
          <StatCard label="Wallet needed" value="No" icon="shield" />
        </section>

        {/* Games and formats */}
        <section aria-labelledby="games-heading" className="py-16">
          <Eyebrow>Launch games</Eyebrow>
          <h2 id="games-heading" className="mt-3 font-display text-mk-h2 uppercase text-fg">
            Pick your game
          </h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {GAME_CARDS.map((game) => (
              <li
                key={game.name}
                className="surface-card flex flex-col gap-4 rounded-card p-6 shadow-hard-sm [--hard-ink:var(--shadow-ink)]"
              >
                <PixelIcon
                  name={game.icon}
                  size={28}
                  className="text-accent [--hard-ink:var(--accent-ink)]"
                />
                <h3 className="font-display text-[18px] font-black uppercase tracking-[-0.01em] text-fg">
                  {game.name}
                </h3>
                <p className="text-[12px] leading-relaxed text-fg-muted">{game.body}</p>
                <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4 text-[11px]">
                  <div>
                    <dt className="label-caps text-fg-subtle">Format</dt>
                    <dd className="mt-1 font-semibold text-fg">{game.format}</dd>
                  </div>
                  <div>
                    <dt className="label-caps text-fg-subtle">Proof</dt>
                    <dd className="mt-1 font-semibold text-fg">{game.proof}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <hr className="border-line" />

        {/* How it works */}
        <section aria-labelledby="how-heading" className="py-20">
          <Eyebrow>Learn</Eyebrow>
          <h2 id="how-heading" className="mt-3 font-display text-mk-h2 uppercase text-fg">
            How it works
          </h2>
          <ol className="mt-12 grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="space-y-3">
                <StepHeader index={index} icon={step.icon} />
                <h3 className="font-display text-[15px] font-bold uppercase tracking-[0.02em] text-fg">
                  {step.title}
                </h3>
                <p className="max-w-[320px] text-[11px] font-medium uppercase leading-relaxed tracking-[0.04em] text-fg-subtle">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <PromoBanner
          eyebrow="Free to play"
          title="Get started now!"
          action={
            <ButtonLink href="/onboarding/phone" variant="white" arrow>
              Create free account
            </ButtonLink>
          }
        >
          Post a challenge, play your rival, and build a rating that means something.
        </PromoBanner>

        <hr className="mt-20 border-line" />

        {/* Feature split */}
        <section
          aria-labelledby="learn-heading"
          className="grid items-center gap-10 py-20 md:grid-cols-[5fr_6fr]"
        >
          <div className="flex justify-center">
            <PixelCube size={280} className="animate-float [--float-rot:-4deg]" />
          </div>
          <div className="space-y-5">
            <Eyebrow>Built for fair play</Eyebrow>
            <h2 id="learn-heading" className="font-display text-mk-h2-mixed text-fg">
              Learn more about{' '}
              <span className="bg-gradient-to-r from-accent to-purple-300 bg-clip-text text-transparent">
                RAISE
              </span>
            </h2>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Every match keeps its proof. Both players report the result, and anything that does
              not match goes to a moderator, not a coin flip.
            </p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Your rating, record and reputation are public, so you always know who you are about to
              play.
            </p>
            <ButtonLink href="/onboarding/phone" arrow>
              Start playing now!
            </ButtonLink>
          </div>
        </section>
      </div>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-[1120px] py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="relative inline-block">
              <PixelIcon
                name="chat"
                size={64}
                className="absolute -top-14 left-20 rotate-[8deg] text-accent [--hard-ink:var(--accent-ink)]"
              />
              <h2 id="faq-heading" className="font-display text-mk-h2 uppercase text-fg">
                FAQ
              </h2>
            </div>
            <div className="mt-3">
              <p className="eyebrow">
                More questions?{' '}
                <Link
                  href="/feedback"
                  className="text-fg underline underline-offset-4 hover:text-accent"
                >
                  Send us feedback
                </Link>
              </p>
            </div>
          </div>
          <Accordion items={FAQ} className="lg:mt-4" />
        </div>
      </section>

      {/* Create CTA */}
      <section className="mx-auto max-w-[1120px] pt-16">
        <div className="spotlight-purple relative rounded-lg border border-line px-6 pb-12 pt-20 text-center shadow-hard [--hard-ink:var(--accent-ink)] md:px-8">
          <PixelCube size={120} className="absolute -top-14 left-1/2 -translate-x-1/2" />
          <PixelIcon
            name="star"
            size={34}
            className="animate-float absolute left-[8%] top-[40%] hidden text-cream sm:block"
          />
          <PixelIcon
            name="bolt"
            size={26}
            className="animate-float absolute right-[10%] top-[22%] hidden text-cream [animation-delay:-3s] sm:block"
          />
          <Eyebrow className="justify-center">Your rivalry</Eyebrow>
          <h2 className="mt-4 font-display text-mk-h2-mixed text-fg">
            Create your first challenge
          </h2>
          <p className="mx-auto mt-4 max-w-[400px] text-[12px] leading-relaxed text-fg-muted">
            Choose the game and the format, invite a friend or open it to everyone. Once someone
            accepts, the match room opens and the clock starts.
          </p>
          <div className="mt-7 flex justify-center">
            <ButtonLink href="/onboarding/phone" variant="white" arrow>
              Create free account
            </ButtonLink>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-fg-subtle">
            <Icon name="shield" size={12} /> Free to play. Every result settled with proof.
          </p>
        </div>
      </section>
    </div>
  );
}
