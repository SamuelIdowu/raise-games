import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MatchStatus } from '@raise/api-client';
import { MatchTimeline } from './match-timeline';

const NOW = Date.parse('2026-11-14T18:00:00Z');
const me = {
  userId: 'me',
  username: 'Alice',
  rating: 1200,
  rankTier: 'rookie',
  rankLabel: 'Rookie',
  provisional: true,
  record: '3–1–0',
  reputation: 'new' as const,
  gameId: 'alice_efb',
  side: 0,
  isPoster: true,
  submittedAt: null,
};

function viewFor(status: MatchStatus) {
  const deadline =
    status === 'awaiting_confirmation'
      ? { kind: 'confirm_result' as const, at: new Date(NOW + 5 * 3600_000).toISOString() }
      : ['accepted', 'in_progress', 'awaiting_result'].includes(status)
        ? { kind: 'submit_result' as const, at: new Date(NOW + 42 * 60_000).toISOString() }
        : null;
  return { status, deadline, me, viewerRole: 'participant' as const };
}

const meta = {
  title: 'Match/Timeline',
  component: MatchTimeline,
  args: { view: viewFor('in_progress'), now: NOW },
} satisfies Meta<typeof MatchTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};
export const AwaitingConfirmation: Story = { args: { view: viewFor('awaiting_confirmation') } };
export const Disputed: Story = { args: { view: viewFor('disputed') } };
export const Confirmed: Story = { args: { view: viewFor('confirmed') } };
export const Forfeited: Story = { args: { view: viewFor('forfeited') } };
