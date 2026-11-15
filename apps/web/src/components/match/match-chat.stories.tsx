import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MatchPlayer } from '@raise/api-client';
import type { ChatEntry } from '@/lib/use-match-room';
import { MatchChat } from './match-chat';

const player = (userId: string, username: string, side: number): MatchPlayer => ({
  userId,
  username,
  rating: 1200 + side * 40,
  rankTier: 'challenger',
  rankLabel: 'Challenger',
  provisional: false,
  record: '8–3–1',
  reputation: 'new',
  gameId: `${username.toLowerCase()}_efb`,
  side,
  isPoster: side === 0,
  submittedAt: null,
});
const players = [player('me', 'Alice', 0), player('bola', 'Bola', 1)];

let n = 0;
const entry = (
  senderId: string | null,
  body: string,
  extra: Partial<ChatEntry> = {},
): ChatEntry => ({
  id: `m${++n}`,
  matchId: 'match',
  conversationId: 'conv',
  senderId,
  kind: senderId ? 'user' : 'system',
  body,
  clientMsgId: `c${n}`,
  createdAt: new Date(Date.parse('2026-11-14T18:00:00Z') + n * 60_000).toISOString(),
  delivery: 'sent',
  ...extra,
});

const conversation: ChatEntry[] = [
  entry('bola', 'Ready in 10? I will create the room.'),
  entry('me', 'Yes. Send the code here.'),
  entry('bola', 'Room code is up on your screen. Best of one, no pausing.'),
  entry('me', 'Joining now', { delivery: 'sending' }),
  entry('me', 'gg, submitting after', { delivery: 'failed', error: 'Not sent' }),
];

const meta = {
  title: 'Match/Chat',
  component: MatchChat,
  args: {
    matchId: 'match',
    meId: 'me',
    players,
    messages: conversation,
    locked: false,
    canSend: true,
    onSend: () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof MatchChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const Empty: Story = { args: { messages: [] } };
export const Locked: Story = {
  args: {
    messages: [
      ...conversation.slice(0, 3),
      entry(null, 'Chat is closed. Messages are kept for dispute review.'),
    ],
    locked: true,
  },
};
export const StaffReadOnly: Story = { args: { meId: null, canSend: false } };
