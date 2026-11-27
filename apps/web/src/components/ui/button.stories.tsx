import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Create challenge' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'brand', 'secondary', 'white', 'outline', 'ghost', 'danger'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: 'secondary' } };

export const Ghost: Story = { args: { variant: 'ghost', children: 'View rules' } };

export const Danger: Story = { args: { variant: 'danger', children: 'Cancel challenge' } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Loading: Story = { args: { loading: true, children: 'Saving' } };

export const DisabledWithHint: Story = {
  args: { disabled: true, hint: 'Add a game first to continue.', children: 'Create challenge' },
};

export const FullWidth: Story = {
  args: { fullWidth: true },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
};

/** i18n growth: +30% length must not clip or wrap the label. */
export const LongLabel: Story = {
  args: { children: 'Create a challenge and invite an opponent now' },
};

/** Blocks.fun §7.3: the full variant set, with the CTA arrow. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button arrow>Start playing</Button>
      <Button variant="brand" arrow>
        Create challenge
      </Button>
      <Button variant="secondary" arrow>
        View leaderboard
      </Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="ghost">View rules</Button>
      <Button variant="danger">Sign out everywhere</Button>
      <div className="rounded-lg bg-brand p-4">
        <Button variant="white" arrow>
          Connect
        </Button>
      </div>
    </div>
  ),
};
