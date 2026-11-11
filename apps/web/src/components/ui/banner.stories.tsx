import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner } from './banner';
import { Button } from './button';

const meta = {
  title: 'Components/Banner',
  component: Banner,
  args: {
    variant: 'needs-action',
    children: 'Your opponent submitted a result — confirm or dispute it.',
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsAction: Story = {
  args: { action: <Button size="sm">Open</Button> },
};

export const Offline: Story = {
  args: { variant: 'offline', children: "You're offline. Results will sync when you reconnect." },
};

export const System: Story = {
  args: { variant: 'system', children: 'Scheduled maintenance Sunday 02:00–03:00 WAT.' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-[420px] flex-col gap-3">
      <Banner variant="needs-action">Needs action banner.</Banner>
      <Banner variant="offline">Offline banner.</Banner>
      <Banner variant="system">System banner.</Banner>
    </div>
  ),
};
