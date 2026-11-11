import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { label: 'Username', placeholder: 'e.g. ade_plays' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHelper: Story = { args: { helper: '3–20 characters, letters and numbers.' } };

export const WithError: Story = {
  args: {
    label: 'Phone',
    placeholder: '0801 234 5678',
    error: 'Enter a valid Nigerian mobile number.',
  },
};

export const Numeric: Story = {
  args: { label: 'Stake', placeholder: '2000', inputMode: 'numeric', helper: 'Minimum ₦500.' },
};

export const Disabled: Story = { args: { disabled: true, helper: 'Complete your profile first.' } };
