'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Banner,
  Button,
  CountUp,
  EmptyState,
  Input,
  OtpInput,
  RankTierBadge,
  RatingBadge,
  ReputationBadge,
  Sheet,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
  type StatusChipVariant,
} from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';

const swatches = [
  { name: 'bg-0', var: '--bg-0' },
  { name: 'bg-1 surface', var: '--bg-1' },
  { name: 'bg-2 raised', var: '--bg-2' },
  { name: 'bg-3 overlay', var: '--bg-3' },
  { name: 'border', var: '--border' },
  { name: 'border-strong', var: '--border-strong' },
  { name: 'text-1', var: '--text-1' },
  { name: 'text-2', var: '--text-2' },
  { name: 'text-3', var: '--text-3' },
  { name: 'accent', var: '--accent' },
  { name: 'accent-hover', var: '--accent-hover' },
  { name: 'accent-press', var: '--accent-press' },
  { name: 'win', var: '--win' },
  { name: 'loss', var: '--loss' },
  { name: 'dispute', var: '--dispute' },
];

const chipVariants: Array<{ variant: StatusChipVariant; label: string }> = [
  { variant: 'neutral', label: 'Neutral' },
  { variant: 'accent', label: 'Accent' },
  { variant: 'win', label: 'Win' },
  { variant: 'loss', label: 'Loss' },
  { variant: 'dispute', label: 'Dispute' },
  { variant: 'muted', label: 'Muted' },
];

const tableRows = [
  { id: 'RZ-1042', game: 'FIFA 25', stake: '₦2,000', state: 'In progress' },
  { id: 'RZ-1043', game: 'Call of Duty', stake: '₦5,000', state: 'Awaiting result' },
  { id: 'RZ-1044', game: 'Tekken 8', stake: '₦1,500', state: 'Confirmed' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface-card rounded-card p-5">
      <h2 className="label-caps mb-4 text-fg-muted">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function FontProofPage() {
  const [otp, setOtp] = useState('');
  const [resend, setResend] = useState(30);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rating, setRating] = useState(1180);
  const { toast } = useToast();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold uppercase tracking-tight text-fg">
            Font proof — Unbounded & Space Grotesk
          </h1>
          <p className="mt-2 text-body-sm text-fg-muted">
            Verifies Latin-Extended glyphs (ẹ, ọ, ṣ), tabular numerals, and preload budget.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="App typography scale (Unbounded display / Space Grotesk body)">
        <div className="flex flex-col gap-3">
          <p className="font-display text-display font-bold text-fg">Display 40/48</p>
          <p className="font-display text-mk-h1 uppercase text-fg text-balance">Heading 1 32/40</p>
          <p className="font-display text-h2 font-black uppercase text-fg">Heading 2 24/32</p>
          <p className="font-display text-h3 font-black uppercase text-fg">Heading 3 18/24</p>
          <p className="text-body text-fg">
            Body 14/20 — verified 1v1 challenges with real stakes and instant settlement.
          </p>
          <p className="text-body-sm text-fg-muted">Body small 13/20 — secondary copy.</p>
          <p className="text-caption text-fg-subtle">Caption 12/16 — timestamps and metadata.</p>
          <p className="label-caps text-fg-muted">Label caps 11/16</p>
          <p className="font-display text-stat-lg font-semibold text-fg tabular">₦48,500</p>
        </div>
      </Section>

      <Section title="Marketing typography scale (Unbounded only)">
        <div className="flex flex-col gap-3">
          <p className="font-display text-mk-display font-bold text-fg">Marketing display 40/48</p>
          <p className="font-display text-mk-h1 font-bold text-fg">Marketing H1 32/40</p>
          <p className="font-display text-mk-h2 font-bold text-fg">Marketing H2 24/32</p>
          <p className="font-display text-mk-h3 font-semibold text-fg">Marketing H3 20/28</p>
          <p className="text-mk-body text-fg">Marketing body 16/24 — for landing pages.</p>
        </div>
      </Section>

      <Section title="Yoruba glyphs in Unbounded display face">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ẹ</code>
            <p className="mt-2 font-display text-[48px] font-semibold text-fg">ẹ</p>
            <p className="mt-1 text-caption text-fg-subtle">U+1EB9</p>
          </div>
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ọ</code>
            <p className="mt-2 font-display text-[48px] font-semibold text-fg">ọ</p>
            <p className="mt-1 text-caption text-fg-subtle">U+1ECD</p>
          </div>
          <div className="rounded-control border border-line bg-surface p-4 text-center">
            <code className="font-display text-body-sm text-fg-muted">ṣ</code>
            <p className="mt-2 font-display text-[48px] font-semibold text-fg">ṣ</p>
            <p className="mt-1 text-caption text-fg-subtle">U+1E63</p>
          </div>
        </div>
        <p className="mt-4 font-display text-h3 font-black uppercase text-fg">
          Lagos ẹbá ṣíṣẹ́ — Unbounded 500/600/700
        </p>
      </Section>

      <Section title="Tabular numerals at 12px & 14px (Space Grotesk mono fallback)">
        <p className="text-body-sm text-fg-muted">
          If digits misalign at small sizes, fallback to mono face per design decision.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-control border border-line bg-surface p-4">
            <code className="font-display text-body-sm text-fg-muted">12px tabular</code>
            <pre className="mt-2 font-mono text-[12px] tabular-nums text-fg">
              {`₦ 1,234,567
₦    98,765
₦     1,234`}
            </pre>
          </div>
          <div className="rounded-control border border-line bg-surface p-4">
            <code className="font-display text-body-sm text-fg-muted">14px tabular</code>
            <pre className="mt-2 font-mono text-[14px] tabular-nums text-fg">
              {`₦ 1,234,567
₦    98,765
₦     1,234`}
            </pre>
          </div>
        </div>
      </Section>

      <Section title="Weight samples (500 / 600 / 700) — Unbounded">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { weight: 500, label: 'Regular (500)' },
            { weight: 600, label: 'Semi-bold (600)' },
            { weight: 700, label: 'Bold (700)' },
          ].map(({ weight, label }) => (
            <div key={weight} className="rounded-control border border-line bg-surface p-4">
              <code className="font-display text-body-sm text-fg-muted">{label}</code>
              <p className="mt-2 font-display text-h3 text-fg" style={{ fontWeight: weight }}>
                Lagos ẹbá ṣíṣẹ́
              </p>
              <p className="mt-1 text-caption text-fg-subtle" style={{ fontWeight: weight }}>
                Quick brown fox jumps over the lazy dog 1234567890
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading>Saving</Button>
          <Button variant="secondary" disabled hint="Add a game first to continue.">
            Create challenge
          </Button>
        </div>
        <Button fullWidth>Full width</Button>
      </Section>

      <Section title="Inputs and OTP">
        <Input label="Username" placeholder="e.g. ade_plays" helper="3–20 characters." />
        <Input
          label="Phone"
          placeholder="0801 234 5678"
          error="Enter a valid Nigerian mobile number."
        />
        <OtpInput
          value={otp}
          onChange={setOtp}
          resendSeconds={resend}
          onResend={() => setResend(30)}
        />
        <p className="text-caption text-fg-muted">Code entered: {otp || '—'}</p>
      </Section>

      <Section title="Status chips">
        <div className="flex flex-wrap items-center gap-2">
          {chipVariants.map((chip) => (
            <StatusChip
              key={chip.variant}
              label={chip.label}
              variant={chip.variant}
              icon={chip.variant === 'dispute' ? 'alert-triangle' : undefined}
            />
          ))}
        </div>
      </Section>

      <Section title="Banners">
        <Banner variant="needs-action" action={<Button size="sm">Open</Button>}>
          Your opponent submitted a result — confirm or dispute it.
        </Banner>
        <Banner variant="offline">
          You&apos;re offline. Results will sync when you reconnect.
        </Banner>
        <Banner variant="system">Scheduled maintenance Sunday 02:00–03:00 WAT.</Banner>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon="flag"
          title="No challenges yet"
          description="Create your first challenge to start building your rating."
          action={<Button>Create challenge</Button>}
        />
      </Section>

      <Section title="Avatars and badges">
        <div className="flex items-center gap-3">
          <Avatar username="Ade" size={32} />
          <Avatar username="Chioma Okafor" size={64} />
          <Avatar username="Tunde" size={32} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RatingBadge value={rating} />
          <RatingBadge value={1180} provisional />
          <RankTierBadge tier={2} />
          <RankTierBadge tier={5} />
          <ReputationBadge level="new" />
          <ReputationBadge level="low" />
          <ReputationBadge level="reliable" />
          <ReputationBadge level="trusted" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRating((current) => current + 12)}
          >
            Win +12
          </Button>
          <CountUp value={rating} className="font-display text-stat-lg font-semibold text-fg" />
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHead>
            <TableHeaderCell>ID</TableHeaderCell>
            <TableHeaderCell>Game</TableHeaderCell>
            <TableHeaderCell numeric>Stake</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
          </TableHead>
          <TableBody>
            {tableRows.map((row) => (
              <TableRow key={row.id} selected={row.id === 'RZ-1042'}>
                <TableCell className="font-display text-accent">{row.id}</TableCell>
                <TableCell>{row.game}</TableCell>
                <TableCell numeric>{row.stake}</TableCell>
                <TableCell>
                  <StatusChip label={row.state} variant="neutral" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Type proof (F1.2)">
        <p className="font-display text-h2 font-black uppercase text-fg">Yorùbá: ẹ ọ ṣ Ẹ Ọ Ṣ</p>
        <p className="font-display text-caption text-fg-muted">12px: ẹ ọ ṣ Ẹ Ọ Ṣ — Ẹ̀kọ́ àti Ọ̀rẹ̀</p>
        <div className="grid grid-cols-10 gap-1 font-display text-caption text-fg tabular">
          {'0123456789'.split('').map((digit) => (
            <span
              key={digit}
              className="rounded-[2px] border border-line bg-raised py-1 text-center"
            >
              {digit}
            </span>
          ))}
        </div>
        <p className="text-caption text-fg-muted">
          Tabular figures at 12px stay column-aligned. Unbounded keeps them at 12–14px (provisional,
          device test outstanding).
        </p>
      </Section>

      <Section title="Skeletons">
        <SkeletonCard />
        <Skeleton className="h-10 w-full" />
        <SkeletonText lines={3} />
      </Section>

      <Section title="Toast and sheet">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => toast({ title: 'Challenge accepted', description: 'Opponent joined.' })}
          >
            Show toast
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              toast({
                title: 'Upload failed',
                description: 'Check your connection and try again.',
                variant: 'error',
              })
            }
          >
            Show error toast
          </Button>
          <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        </div>
      </Section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Confirm result"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Confirm
            </Button>
          </div>
        }
      >
        <p className="text-body text-fg">
          Your opponent submitted a 2–1 win. Confirming locks the result and updates both ratings.
        </p>
      </Sheet>

      <nav className="flex justify-center">
        <Link
          href="/design"
          className="inline-flex h-11 items-center justify-center rounded-control border border-transparent bg-accent px-4 font-display text-h3 font-black uppercase text-on-accent transition-colors duration-[var(--motion-micro)] hover:bg-accent-hover"
        >
          Back to design system
        </Link>
      </nav>
    </main>
  );
}
