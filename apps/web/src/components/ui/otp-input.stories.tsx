import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { OtpInput, type OtpInputProps } from './otp-input';

type OtpDemoProps = Omit<OtpInputProps, 'onChange'>;

function OtpDemo(props: OtpDemoProps) {
  const [value, setValue] = useState(props.value);
  return <OtpInput {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Components/OTP input',
  component: OtpDemo,
  args: { value: '', label: 'One-time code', resendSeconds: 30 },
} satisfies Meta<typeof OtpDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = { args: { value: '482915' } };

export const WithError: Story = { args: { value: '4829', error: 'That code is incorrect.' } };

export const ResendReady: Story = { args: { value: '482915', resendSeconds: 0 } };
