import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusChip, type StatusChipVariant } from './status-chip';

const variants: StatusChipVariant[] = ['neutral', 'accent', 'win', 'loss', 'dispute', 'muted'];

const meta = {
  title: 'Components/Status chip',
  component: StatusChip,
  args: { label: 'In progress', variant: 'accent', icon: 'play' },
} satisfies Meta<typeof StatusChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {variants.map((variant) => (
        <StatusChip key={variant} label={variant} variant={variant} />
      ))}
    </div>
  ),
};

export const MatchStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip label="Open" icon="circle" />
      <StatusChip label="Accepted" variant="accent" icon="check" />
      <StatusChip label="In progress" variant="accent" icon="play" />
      <StatusChip label="Awaiting result" variant="neutral" icon="clock" />
      <StatusChip label="Disputed" variant="dispute" icon="alert-triangle" />
      <StatusChip label="Confirmed" variant="win" icon="check-circle" />
      <StatusChip label="Cancelled" variant="muted" icon="ban" />
      <StatusChip label="Expired" variant="muted" icon="hourglass" />
    </div>
  ),
};
