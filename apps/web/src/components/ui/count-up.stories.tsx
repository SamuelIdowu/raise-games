import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button';
import { CountUp } from './count-up';

function CountUpDemo() {
  const [rating, setRating] = useState(1180);
  return (
    <div className="flex flex-col gap-3">
      <CountUp value={rating} className="font-display text-stat-lg font-semibold text-fg" />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRating((value) => value + 12)}>
          Win +12
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRating((value) => value - 12)}>
          Loss −12
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: 'Motion/CountUp',
  component: CountUpDemo,
} satisfies Meta<typeof CountUpDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RatingChange: Story = {};
