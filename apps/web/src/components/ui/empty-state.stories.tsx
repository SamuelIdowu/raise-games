import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Components/Empty state',
  component: EmptyState,
  args: {
    icon: 'flag',
    title: 'No challenges yet',
    description: 'Create your first challenge to start building your rating.',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: { action: <Button>Create challenge</Button> },
};
