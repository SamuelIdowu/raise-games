import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { OutcomeSelector } from './outcome-selector';

function Demo({ draw }: { draw: boolean }) {
  const [value, setValue] = useState<'win' | 'loss' | 'draw' | 'no_show' | null>('win');
  const options = [
    { value: 'win' as const, label: 'I won' },
    { value: 'loss' as const, label: 'I lost' },
    ...(draw ? [{ value: 'draw' as const, label: 'Draw' }] : []),
    {
      value: 'no_show' as const,
      label: 'Opponent did not show up',
      description: 'Available 20 minutes after the agreed start',
    },
  ];
  return (
    <div className="max-w-sm">
      <OutcomeSelector legend="Outcome" options={options} value={value} onChange={setValue} />
    </div>
  );
}

const meta: Meta<typeof Demo> = { title: 'Components/Outcome selector', component: Demo };
export default meta;

export const WinLoss: StoryObj<typeof Demo> = { args: { draw: false } };
export const WithDraw: StoryObj<typeof Demo> = { args: { draw: true } };
