import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ScoreStepper } from './score-stepper';

function Pair({ model }: { model: 'goals' | 'placement' }) {
  const bounds =
    model === 'goals'
      ? { min: 0, max: 99, unit: 'goals' }
      : { min: 1, max: 100, unit: 'placement' };
  const [self, setSelf] = useState(model === 'goals' ? 3 : 1);
  const [opp, setOpp] = useState(model === 'goals' ? 0 : 100);
  return (
    <div className="grid max-w-sm grid-cols-2 gap-4">
      <ScoreStepper
        label="You"
        unit={bounds.unit}
        min={bounds.min}
        max={bounds.max}
        value={self}
        onChange={setSelf}
      />
      <ScoreStepper
        label="Opponent"
        unit={bounds.unit}
        min={bounds.min}
        max={bounds.max}
        value={opp}
        onChange={setOpp}
      />
    </div>
  );
}

const meta: Meta<typeof Pair> = {
  title: 'Components/Score stepper',
  component: Pair,
  parameters: {
    docs: {
      description: {
        component: 'Driven by the game config score model. Buttons disable at the bounds.',
      },
    },
  },
};
export default meta;

export const Goals: StoryObj<typeof Pair> = { args: { model: 'goals' } };
export const PlacementAtBounds: StoryObj<typeof Pair> = { args: { model: 'placement' } };
