import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { username: 'Chioma Okafor' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = { args: { size: 32 } };

export const Large: Story = { args: { size: 64 } };

export const Deterministic: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar username="Ade" />
      <Avatar username="Chioma Okafor" size={64} />
      <Avatar username="Tunde" />
      <Avatar username="Ade" />
    </div>
  ),
};
