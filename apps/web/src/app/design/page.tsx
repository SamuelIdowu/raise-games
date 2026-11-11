'use client';

import { useState, type ReactNode } from 'react';
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
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="label-caps mb-4 text-fg-muted">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function DesignPage() {
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
            Design system
          </h1>
          <p className="mt-1 text-body-sm text-fg-muted">
            Stage 1 tokens and components, dark and light.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <p className="font-display text-display font-bold text-fg">Display 32/36</p>
          <p className="font-display text-h1 font-semibold text-fg">Heading 1 24/28</p>
          <p className="font-display text-h2 font-semibold text-fg">Heading 2 20/24</p>
          <p className="font-display text-h3 font-semibold text-fg">Heading 3 16/20</p>
          <p className="text-body text-fg">
            Body 16/24 — verified 1v1 challenges with real stakes and instant settlement.
          </p>
          <p className="text-body-sm text-fg-muted">Body small 14/20 — secondary copy.</p>
          <p className="text-caption text-fg-subtle">Caption 12/16 — timestamps and metadata.</p>
          <p className="label-caps text-fg-muted">Label caps 12/16</p>
          <p className="font-display text-stat-lg font-semibold text-fg tabular">₦48,500</p>
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {swatches.map((swatch) => (
            <div key={swatch.name} className="flex items-center gap-2">
              <span
                className="size-8 rounded-[2px] border border-line-strong"
                style={{ backgroundColor: `var(${swatch.var})` }}
              />
              <span className="text-caption text-fg-muted">{swatch.name}</span>
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
        <p className="font-display text-h2 font-semibold text-fg">Yorùbá: ẹ ọ ṣ Ẹ Ọ Ṣ</p>
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
          Tabular figures at 12px stay column-aligned. Chakra Petch keeps them at 12–14px
          (provisional, device test outstanding).
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
    </main>
  );
}
