import type { Meta, StoryObj } from '@storybook/react-vite';
import { RankTierBadge, RatingBadge, ReputationBadge } from './badges';

function BadgeGallery() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <RatingBadge value={1180} />
        <RatingBadge value={1180} provisional />
        <RatingBadge value={12840} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <RankTierBadge tier={1} />
        <RankTierBadge tier={2} />
        <RankTierBadge tier={3} />
        <RankTierBadge tier={4} />
        <RankTierBadge tier={5} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ReputationBadge level="new" />
        <ReputationBadge level="low" />
        <ReputationBadge level="reliable" />
        <ReputationBadge level="trusted" />
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/Badges',
  component: BadgeGallery,
} satisfies Meta<typeof BadgeGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
